"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/auth/session";
const partySchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2).max(160),
  tax_id: z.string().trim().max(30).optional(),
  email: z.union([z.email(), z.literal("")]).optional(),
  phone: z.string().trim().max(30).optional(),
});
const catalogSchema = z.object({
  id: z.uuid().optional(),
  kind: z.enum(["product", "service"]),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(500).optional(),
  unit: z.string().trim().min(1).max(20),
  unit_price: z.coerce.number().min(0),
});
export async function saveParty(
  kind: "customers" | "suppliers",
  formData: FormData,
) {
  const parsed = partySchema.parse(Object.fromEntries(formData));
  const { organizationId, supabase } = await requireMembership();
  const payload = {
    organization_id: organizationId,
    name: parsed.name,
    tax_id: parsed.tax_id || null,
    email: parsed.email || null,
    phone: parsed.phone || null,
  };
  const result = parsed.id
    ? await supabase
        .from(kind)
        .update(payload)
        .eq("id", parsed.id)
        .eq("organization_id", organizationId)
    : await supabase.from(kind).insert(payload);
  if (result.error) throw new Error("Não foi possível salvar o cadastro");
  revalidatePath(kind === "customers" ? "/customers" : "/suppliers");
}
export async function deleteParty(
  kind: "customers" | "suppliers",
  formData: FormData,
) {
  const id = z.uuid().parse(formData.get("id"));
  const { organizationId, supabase } = await requireMembership();
  const { error } = await supabase
    .from(kind)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", organizationId);
  if (error) throw new Error("Não foi possível excluir o cadastro");
  revalidatePath(kind === "customers" ? "/customers" : "/suppliers");
}
export async function saveCatalog(formData: FormData) {
  const parsed = catalogSchema.parse(Object.fromEntries(formData));
  const { organizationId, supabase } = await requireMembership();
  const payload = {
    organization_id: organizationId,
    kind: parsed.kind,
    name: parsed.name,
    description: parsed.description || null,
    unit: parsed.unit,
    unit_price: parsed.unit_price,
  };
  const result = parsed.id
    ? await supabase
        .from("catalog_items")
        .update(payload)
        .eq("id", parsed.id)
        .eq("organization_id", organizationId)
    : await supabase.from("catalog_items").insert(payload);
  if (result.error) throw new Error("Não foi possível salvar o item");
  revalidatePath("/catalog");
}
export async function deleteCatalog(formData: FormData) {
  const id = z.uuid().parse(formData.get("id"));
  const { organizationId, supabase } = await requireMembership();
  const { error } = await supabase
    .from("catalog_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", organizationId);
  if (error) throw new Error("Não foi possível excluir o item");
  revalidatePath("/catalog");
}

const docForm = z.object({
  type: z.enum(["quote", "purchase_order"]),
  counterparty_id: z.uuid(),
  description: z.string().trim().min(2).max(500),
  quantity: z.coerce.number().positive(),
  unit: z.string().trim().min(1).max(20),
  unit_price: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).default(0),
  shipping: z.coerce.number().min(0).default(0),
  validity: z.string().trim().max(100).optional(),
  deadline: z.string().trim().min(2),
  payment_terms: z.string().trim().min(2),
  notes: z.string().trim().max(2000).optional(),
});
export async function createDocument(formData: FormData) {
  const data = docForm.parse(Object.fromEntries(formData));
  const { organizationId, supabase, user } = await requireMembership();
  const table = data.type === "quote" ? "customers" : "suppliers";
  const { data: party, error: partyError } = await supabase
    .from(table)
    .select("id,name,tax_id,email,phone,address")
    .eq("id", data.counterparty_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .single();
  if (partyError || !party) throw new Error("Cliente ou fornecedor inválido");
  const { data: number, error: numberError } = await supabase.rpc(
    "next_document_number",
    { org_id: organizationId, doc_type: data.type },
  );
  if (numberError || !number)
    throw new Error("Não foi possível gerar a numeração");
  const gross = Math.round(data.quantity * data.unit_price * 100) / 100;
  if (data.discount > gross)
    throw new Error("Desconto superior ao valor do item");
  const total = Math.round((gross - data.discount + data.shipping) * 100) / 100;
  const { data: document, error } = await supabase
    .from("documents")
    .insert({
      organization_id: organizationId,
      type: data.type,
      number,
      status: "draft",
      customer_id: data.type === "quote" ? party.id : null,
      supplier_id: data.type === "purchase_order" ? party.id : null,
      counterparty_snapshot: party,
      subtotal: gross,
      discount: data.discount,
      shipping: data.shipping,
      total,
      commercial_terms: {
        validity: data.validity || null,
        deadline: data.deadline,
        paymentTerms: data.payment_terms,
      },
      notes: data.notes || null,
      issued_by: user.id,
    })
    .select("id")
    .single();
  if (error || !document) throw new Error("Não foi possível criar o documento");
  const { error: itemError } = await supabase
    .from("document_items")
    .insert({
      organization_id: organizationId,
      document_id: document.id,
      position: 1,
      description: data.description,
      quantity: data.quantity,
      unit: data.unit,
      unit_price: data.unit_price,
      discount: data.discount,
      line_total: gross - data.discount,
    });
  if (itemError) {
    await supabase.from("documents").delete().eq("id", document.id);
    throw new Error("Não foi possível salvar o item");
  }
  await supabase
    .from("document_events")
    .insert({
      organization_id: organizationId,
      document_id: document.id,
      event_type: "draft.created",
      actor_id: user.id,
    });
  redirect(`/documents/${document.id}`);
}
export async function duplicateDocument(formData: FormData) {
  const id = z.uuid().parse(formData.get("id"));
  const { organizationId, supabase, user } = await requireMembership();
  const { data: source } = await supabase
    .from("documents")
    .select("*,document_items(*)")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();
  if (!source) throw new Error("Documento não encontrado");
  const { data: number, error: numberError } = await supabase.rpc(
    "next_document_number",
    { org_id: organizationId, doc_type: source.type },
  );
  if (numberError || !number)
    throw new Error("Não foi possível gerar a numeração");
  const { data: copy, error } = await supabase
    .from("documents")
    .insert({
      organization_id: organizationId,
      type: source.type,
      number,
      status: "draft",
      customer_id: source.customer_id,
      supplier_id: source.supplier_id,
      counterparty_id: source.counterparty_id,
      counterparty_snapshot: source.counterparty_snapshot,
      subtotal: source.subtotal,
      discount: source.discount,
      shipping: source.shipping,
      total: source.total,
      commercial_terms: source.commercial_terms,
      notes: source.notes,
      issued_by: user.id,
    })
    .select("id")
    .single();
  if (error || !copy) throw new Error("Não foi possível duplicar");
  const items = (source.document_items ?? []).map(
    (item: Record<string, unknown>) => ({
      organization_id: organizationId,
      document_id: copy.id,
      position: item.position,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      discount: item.discount,
      line_total: item.line_total,
    }),
  );
  if (items.length) await supabase.from("document_items").insert(items);
  await supabase
    .from("document_events")
    .insert({
      organization_id: organizationId,
      document_id: copy.id,
      event_type: "draft.duplicated",
      actor_id: user.id,
      metadata: { source_id: id },
    });
  redirect(`/documents/${copy.id}`);
}
