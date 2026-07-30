"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMembership } from "@/lib/auth/session";
import { calculateDocument } from "@/lib/domain/calculations";

const itemSchema = z.object({
  description: z.string().trim().min(2).max(500),
  quantity: z.coerce.number().positive(),
  unit: z.string().trim().min(1).max(20),
  unitPrice: z.coerce.number().min(0),
  discount: z.coerce.number().min(0),
});

const reasonableDate = z
  .string()
  .optional()
  .refine((value) => {
    if (!value) return true;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const year = Number(match[1]);
    const date = new Date(`${value}T12:00:00Z`);
    return (
      year >= new Date().getFullYear() &&
      year <= new Date().getFullYear() + 10 &&
      date.toISOString().slice(0, 10) === value
    );
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
      .transform((value) =>
        z.array(itemSchema).min(1).max(50).parse(JSON.parse(value)),
      ),
    shipping: z.coerce.number().min(0),
    validity: reasonableDate,
    deadline: z.string().trim().min(2).max(160),
    payment_terms: z.string().trim().min(2).max(300),
    delivery_address: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .transform((value) => ({ ...value, items: value.items_json }));

export type SaveDocumentResult =
  { ok: true; documentId: string } | { ok: false; message: string };

export async function saveDocumentDraft(
  formData: FormData,
): Promise<SaveDocumentResult> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    console.error("document.save.validation_failed", {
      issues: parsed.error.issues.map(({ path, code }) => ({ path, code })),
    });
    return {
      ok: false,
      message:
        "Revise os campos informados. Confira principalmente datas, itens e condições comerciais.",
    };
  }

  const data = parsed.data;
  const { organizationId, supabase, user } = await requireMembership();
  const { data: party, error: partyError } = await supabase
    .from("business_contacts")
    .select(
      "id,legal_name,trade_name,tax_id,email,phone,whatsapp,postal_code,street,street_number,address_extra,district,city,state,is_customer,is_supplier",
    )
    .eq("id", data.counterparty_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .single();
  const hasRequiredRole =
    data.type === "quote" ? party?.is_customer : party?.is_supplier;
  if (partyError || !party || !hasRequiredRole) {
    console.error("document.save.counterparty_not_found", {
      organizationId,
      type: data.type,
      code: partyError?.code,
    });
    return {
      ok: false,
      message:
        data.type === "quote"
          ? "Selecione um cliente válido."
          : "Selecione um fornecedor válido.",
    };
  }
  if (data.type === "quote" && !data.validity)
    return {
      ok: false,
      message: "Informe uma validade válida para o orçamento.",
    };
  if (data.type === "purchase_order" && !data.delivery_address)
    return { ok: false, message: "Informe o endereço de entrega." };

  const snapshot = {
    ...party,
    name: party.legal_name,
    address: {
      postal_code: party.postal_code,
      street: party.street,
      number: party.street_number,
      extra: party.address_extra,
      district: party.district,
      city: party.city,
      state: party.state,
    },
  };
  const totals = calculateDocument(data.items, Number(data.shipping));
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
        type: data.type,
        counterparty_id: party.id,
        counterparty_snapshot: snapshot,
        customer_id: null,
        supplier_id: null,
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
    if (error || !updated) {
      console.error("document.save.update_failed", {
        organizationId,
        code: error?.code,
      });
      return { ok: false, message: "Somente rascunhos podem ser editados." };
    }
    const { error: deleteError } = await supabase
      .from("document_items")
      .delete()
      .eq("document_id", data.id)
      .eq("organization_id", organizationId);
    if (deleteError)
      return {
        ok: false,
        message: "Não foi possível atualizar os itens do documento.",
      };
  } else {
    const { data: existing } = await supabase
      .from("documents")
      .select("id,type")
      .eq("organization_id", organizationId)
      .eq("request_id", data.request_id)
      .maybeSingle();
    if (existing) {
      if (existing.type !== data.type)
        return {
          ok: false,
          message:
            "Este rascunho pertence a outro tipo de documento. Recarregue a página para iniciar um novo.",
        };
      return { ok: true, documentId: existing.id };
    }
    const { data: number, error: numberError } = await supabase.rpc(
      "next_document_number",
      { org_id: organizationId, doc_type: data.type },
    );
    if (numberError || !number)
      return {
        ok: false,
        message: "Não foi possível gerar a numeração. Tente novamente.",
      };
    const { data: created, error } = await supabase
      .from("documents")
      .insert({
        organization_id: organizationId,
        request_id: data.request_id,
        type: data.type,
        number,
        status: "draft",
        counterparty_id: party.id,
        customer_id: null,
        supplier_id: null,
        counterparty_snapshot: snapshot,
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
    if (error || !created) {
      console.error("document.save.insert_failed", {
        organizationId,
        type: data.type,
        code: error?.code,
      });
      return {
        ok: false,
        message: "Não foi possível criar o rascunho. Tente novamente.",
      };
    }
    documentId = created.id;
  }

  const rows = totals.items.map((entry, index) => ({
    organization_id: organizationId,
    document_id: documentId!,
    position: index + 1,
    description: entry.description,
    quantity: entry.quantity,
    unit: entry.unit,
    unit_price: entry.unitPrice,
    discount: entry.discount,
    line_total: entry.lineTotal,
  }));
  const { error: itemError } = await supabase
    .from("document_items")
    .insert(rows);
  if (itemError) {
    console.error("document.save.items_failed", {
      organizationId,
      code: itemError.code,
    });
    return {
      ok: false,
      message:
        "O documento foi salvo, mas os itens não puderam ser atualizados. Tente novamente.",
    };
  }
  await supabase
    .from("document_events")
    .insert({
      organization_id: organizationId,
      document_id: documentId!,
      event_type: data.id ? "draft.updated" : "draft.created",
      actor_id: user.id,
    });
  revalidatePath(`/documents/${documentId}`);
  return { ok: true, documentId: documentId! };
}
