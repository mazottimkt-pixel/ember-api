"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
import { calculateDocument } from "@/lib/domain/calculations";
const item = z.object({
  description: z.string().trim().min(2).max(500),
  quantity: z.coerce.number().positive(),
  unit: z.string().trim().min(1).max(20),
  unitPrice: z.coerce.number().min(0),
  discount: z.coerce.number().min(0),
});
const schema = z
  .object({
    id: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.uuid().optional(),
    ),
    request_id: z.uuid(),
    type: z.enum(["quote", "purchase_order"]),
    counterparty_id: z.uuid(),
    items_json: z
      .string()
      .transform((v) => z.array(item).min(1).max(50).parse(JSON.parse(v))),
    shipping: z.coerce.number().min(0),
    validity: z.string().optional(),
    deadline: z.string().min(2),
    payment_terms: z.string().min(2),
    delivery_address: z.string().optional(),
    notes: z.string().max(2000).optional(),
  })
  .transform((value) => ({ ...value, items: value.items_json }));
export async function saveDocumentDraft(formData: FormData) {
  const data = schema.parse(Object.fromEntries(formData));
  const { organizationId, supabase, user } = await requireMembership();
  const table = data.type === "quote" ? "customers" : "suppliers";
  const { data: party } = await supabase
    .from(table)
    .select("id,name,tax_id,email,phone,address")
    .eq("id", data.counterparty_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .single();
  if (!party)
    throw new Error(
      data.type === "quote"
        ? "Selecione um cliente válido"
        : "Selecione um fornecedor válido",
    );
  if (data.type === "quote" && !data.validity)
    throw new Error("Informe a validade do orçamento");
  if (data.type === "purchase_order" && !data.delivery_address)
    throw new Error("Informe o endereço de entrega");
  const totals = calculateDocument(
    data.items.map((i) => ({
      ...i,
      unitPrice: Number(i.unitPrice),
      quantity: Number(i.quantity),
      discount: Number(i.discount),
    })),
    Number(data.shipping),
  );
  const terms = {
    validity: data.validity || null,
    deadline: data.deadline,
    paymentTerms: data.payment_terms,
    deliveryAddress: data.delivery_address || null,
  };
  let documentId = data.id;
  if (data.id) {
    const { data: updated, error } = await supabase
      .from("documents")
      .update({
        counterparty_snapshot: party,
        customer_id: data.type === "quote" ? party.id : null,
        supplier_id: data.type === "purchase_order" ? party.id : null,
        subtotal: totals.subtotal,
        discount: totals.discount,
        shipping: totals.shipping,
        total: totals.total,
        commercial_terms: terms,
        notes: data.notes || null,
      })
      .eq("id", data.id)
      .eq("organization_id", organizationId)
      .eq("status", "draft")
      .select("id")
      .single();
    if (error || !updated)
      throw new Error("Somente rascunhos podem ser editados");
    const { error: deleteError } = await supabase
      .from("document_items")
      .delete()
      .eq("document_id", data.id)
      .eq("organization_id", organizationId);
    if (deleteError) throw new Error("Não foi possível atualizar os itens");
  } else {
    const existing = await supabase
      .from("documents")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("request_id", data.request_id)
      .maybeSingle();
    if (existing.data) redirect(`/documents/${existing.data.id}`);
    const { data: number, error: numberError } = await supabase.rpc(
      "next_document_number",
      { org_id: organizationId, doc_type: data.type },
    );
    if (numberError || !number)
      throw new Error("Não foi possível gerar a numeração");
    const { data: created, error } = await supabase
      .from("documents")
      .insert({
        organization_id: organizationId,
        request_id: data.request_id,
        type: data.type,
        number,
        status: "draft",
        customer_id: data.type === "quote" ? party.id : null,
        supplier_id: data.type === "purchase_order" ? party.id : null,
        counterparty_snapshot: party,
        subtotal: totals.subtotal,
        discount: totals.discount,
        shipping: totals.shipping,
        total: totals.total,
        commercial_terms: terms,
        notes: data.notes || null,
        issued_by: user.id,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error("Não foi possível criar o rascunho");
    documentId = created.id;
  }
  const rows = totals.items.map((i, index) => ({
    organization_id: organizationId,
    document_id: documentId,
    position: index + 1,
    description: i.description,
    quantity: i.quantity,
    unit: i.unit,
    unit_price: i.unitPrice,
    discount: i.discount,
    line_total: i.lineTotal,
  }));
  const { error: itemError } = await supabase
    .from("document_items")
    .insert(rows);
  if (itemError) {
    await supabase
      .from("documents")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", documentId);
    throw new Error("Não foi possível salvar os itens");
  }
  await supabase.from("document_events").insert({
    organization_id: organizationId,
    document_id: documentId,
    event_type: data.id ? "draft.updated" : "draft.created",
    actor_id: user.id,
  });
  revalidatePath(`/documents/${documentId}`);
  redirect(`/documents/${documentId}?saved=1`);
}
