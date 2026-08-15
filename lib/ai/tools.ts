import "server-only";
import { z } from "zod";
import { calculateDocument } from "@/lib/domain/calculations";
import type { AgentDraft } from "./contracts";
import { brandingSnapshot, defaultBrandingSnapshot } from "@/lib/branding/identity";

type Db = Awaited<ReturnType<typeof import("@/lib/supabase/server").createSupabaseServerClient>>;
export type AgentToolContext = { supabase: Db; organizationId: string; userId: string };

export async function findContact(ctx: AgentToolContext, name: string, role: "customer" | "supplier") {
  const query = ctx.supabase.from("business_contacts")
    .select("id,legal_name,tax_id,is_customer,is_supplier")
    .eq("organization_id", ctx.organizationId).is("deleted_at", null)
    .ilike("legal_name", `%${name.replace(/[%_]/g, "")}%%`).limit(5);
  const { data, error } = await query;
  if (error) throw new Error("CONTACT_SEARCH_FAILED");
  return (data ?? []).filter((row) => role === "customer" ? row.is_customer : row.is_supplier);
}

export async function createContact(ctx: AgentToolContext, input: unknown) {
  const data = z.object({ legalName: z.string().trim().min(2).max(160), taxId: z.string().max(20).optional(), isCustomer: z.boolean(), isSupplier: z.boolean() }).refine(v => v.isCustomer || v.isSupplier).parse(input);
  const { data: created, error } = await ctx.supabase.from("business_contacts").insert({
    organization_id: ctx.organizationId, legal_name: data.legalName, tax_id: data.taxId || null,
    is_customer: data.isCustomer, is_supplier: data.isSupplier,
  }).select("id,legal_name").single();
  if (error || !created) throw new Error("CONTACT_CREATE_FAILED");
  return created;
}

export async function findCatalogItem(ctx: AgentToolContext, query: string) {
  const { data, error } = await ctx.supabase.from("catalog_items").select("id,name,kind,unit,unit_price")
    .eq("organization_id", ctx.organizationId).is("deleted_at", null).ilike("name", `%${query.replace(/[%_]/g, "")}%%`).limit(10);
  if (error) throw new Error("CATALOG_SEARCH_FAILED");
  return data ?? [];
}

export async function createCatalogItem(ctx: AgentToolContext, input: unknown) {
  const data = z.object({ kind: z.enum(["product", "service"]), name: z.string().trim().min(2).max(160), description: z.string().trim().max(500).optional(), unit: z.string().trim().min(1).max(20), unitPrice: z.number().finite().min(0) }).parse(input);
  const { data: created, error } = await ctx.supabase.from("catalog_items").insert({ organization_id: ctx.organizationId, kind: data.kind, name: data.name, description: data.description || null, unit: data.unit, unit_price: data.unitPrice }).select("id,name,kind,unit,unit_price").single();
  if (error || !created) throw new Error("CATALOG_CREATE_FAILED");
  return created;
}

export async function calculateAgentTotals(draft: AgentDraft) {
  return calculateDocument(draft.items, draft.shipping ?? 0);
}

const documentPrefix = (type: "quote" | "purchase_order") => type === "quote" ? "ORC" : "PC";

export async function reserveAgentDocumentNumber(
  ctx: AgentToolContext,
  type: "quote" | "purchase_order",
  year = new Date().getFullYear(),
) {
  const rpc = await ctx.supabase.rpc("next_document_number", {
    org_id: ctx.organizationId,
    doc_type: type,
  });
  if (!rpc.error && rpc.data) return String(rpc.data);
  if (rpc.error?.code !== "P0001" || rpc.error.message !== "forbidden")
    throw new Error("NUMBER_FAILED");

  // Webhook workers use the service-role client, so auth.uid() is intentionally
  // absent and the user-scoped RPC rejects them. Preserve the same sequence and
  // format with a compare-and-swap fallback; authenticated callers remain on RPC.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await ctx.supabase
      .from("document_sequences")
      .select("next_value")
      .eq("organization_id", ctx.organizationId)
      .eq("type", type)
      .eq("year", year)
      .maybeSingle();
    if (current.error) throw new Error("NUMBER_FAILED");

    if (!current.data) {
      const inserted = await ctx.supabase.from("document_sequences").insert({
        organization_id: ctx.organizationId,
        type,
        year,
        next_value: 2,
      });
      if (!inserted.error)
        return `${documentPrefix(type)}-${year}-000001`;
      if (inserted.error.code === "23505") continue;
      throw new Error("NUMBER_FAILED");
    }

    const sequence = Number(current.data.next_value);
    if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error("NUMBER_FAILED");
    const updated = await ctx.supabase
      .from("document_sequences")
      .update({ next_value: sequence + 1 })
      .eq("organization_id", ctx.organizationId)
      .eq("type", type)
      .eq("year", year)
      .eq("next_value", sequence)
      .select("next_value")
      .maybeSingle();
    if (updated.error) throw new Error("NUMBER_FAILED");
    if (updated.data)
      return `${documentPrefix(type)}-${year}-${String(sequence).padStart(6, "0")}`;
  }
  throw new Error("NUMBER_FAILED");
}

export { locateMissingFields } from "./missing";

export async function queryDocuments(ctx: AgentToolContext, query: string) {
  const safe = query.replace(/[%_,]/g, "");
  const { data, error } = await ctx.supabase.from("documents")
    .select("id,number,type,status,total,created_at,counterparty_snapshot")
    .eq("organization_id", ctx.organizationId).is("deleted_at", null)
    .or(`number.ilike.%${safe}%,status.ilike.%${safe}%,counterparty_snapshot->>name.ilike.%${safe}%`).order("created_at", { ascending: false }).limit(10);
  if (error) throw new Error("DOCUMENT_SEARCH_FAILED");
  return data ?? [];
}

export type AgentPartySnapshot = { source: "registered" | "ad_hoc"; name: string; contactId?: string; taxId?: string };
export function persistedDocumentItemRows(organizationId:string,documentId:string,draft:AgentDraft){return calculateDocument(draft.items,draft.shipping??0).items.map((item,index)=>({organization_id:organizationId,document_id:documentId,position:index+1,description:item.description,quantity:item.quantity,unit:item.unit,unit_price:item.unitPrice,discount:item.discount,line_total:item.lineTotal}));}

export async function createAgentDraft(ctx: AgentToolContext, draft: AgentDraft, requestId: string, party?: AgentPartySnapshot) {
  if (draft.type !== "quote" && draft.type !== "purchase_order") throw new Error("INVALID_DOCUMENT_TYPE");
  const { data: existing } = await ctx.supabase.from("documents").select("id,number,status").eq("organization_id", ctx.organizationId).eq("request_id", requestId).maybeSingle();
  if (existing) {
    if (existing.status === "draft") await addOrEditItems(ctx, existing.id, draft);
    return existing;
  }
  const contacts = party ? [] : await findContact(ctx, draft.counterpartyName ?? "", draft.type === "quote" ? "customer" : "supplier");
  const resolvedParty = party ?? (contacts.length === 1 ? { source: "registered" as const, name: contacts[0].legal_name, contactId: contacts[0].id, taxId: contacts[0].tax_id ?? undefined } : undefined);
  if (!resolvedParty) throw new Error(contacts.length ? "AMBIGUOUS_CONTACT" : "PARTY_NOT_RESOLVED");
  const totals = calculateDocument(draft.items, draft.shipping ?? 0);
  const number = await reserveAgentDocumentNumber(ctx, draft.type);
  const brandingResult = await ctx.supabase.from("document_branding_versions").select("*")
    .eq("organization_id", ctx.organizationId).eq("active", true).maybeSingle();
  const visualIdentity = brandingResult.error ? defaultBrandingSnapshot() : brandingSnapshot(brandingResult.data as Record<string, unknown> | null);
  const { data: document, error } = await ctx.supabase.from("documents").insert({
    organization_id: ctx.organizationId, request_id: requestId, type: draft.type, number, status: "draft",
    counterparty_id: resolvedParty.contactId ?? null, customer_id: null, supplier_id: null,
    counterparty_snapshot: { id: resolvedParty.contactId ?? null, name: resolvedParty.name, party_source: resolvedParty.source, document_type: resolvedParty.taxId ? "cnpj" : null, document_number: resolvedParty.taxId ?? null },
    subtotal: totals.subtotal, discount: totals.discount, shipping: totals.shipping, total: totals.total,
    commercial_terms: { validity: draft.validity, deadline: draft.deadline, paymentTerms: draft.paymentTerms, deliveryAddress: draft.deliveryAddress },
    notes: draft.notes, issued_by: ctx.userId,
    branding_snapshot: visualIdentity,
  }).select("id,number").single();
  if (error?.code === "23505") {
    const { data: raced } = await ctx.supabase.from("documents").select("id,number,status").eq("organization_id", ctx.organizationId).eq("request_id", requestId).single();
    if (raced) {
      if (raced.status === "draft") await addOrEditItems(ctx, raced.id, draft);
      return raced;
    }
  }
  if (error || !document) throw new Error("DRAFT_CREATE_FAILED");
  const rows = persistedDocumentItemRows(ctx.organizationId,document.id,draft);
  const { error: itemError } = await ctx.supabase.from("document_items").insert(rows);
  if (itemError) throw new Error("ITEM_CREATE_FAILED");
  await ctx.supabase.from("document_events").insert({ organization_id: ctx.organizationId, document_id: document.id, event_type: "agent.draft.created", actor_id: ctx.userId });
  return document;
}

export async function addOrEditItems(ctx: AgentToolContext, documentId: string, draft: AgentDraft) {
  z.uuid().parse(documentId);
  const totals = calculateDocument(draft.items, draft.shipping ?? 0);
  const { data: allowed } = await ctx.supabase.from("documents").select("id").eq("id", documentId).eq("organization_id", ctx.organizationId).eq("status", "draft").single();
  if (!allowed) throw new Error("DRAFT_NOT_EDITABLE");
  await ctx.supabase.from("document_items").delete().eq("document_id", documentId).eq("organization_id", ctx.organizationId);
  const { error } = await ctx.supabase.from("document_items").insert(persistedDocumentItemRows(ctx.organizationId,documentId,draft));
  if (error) throw new Error("ITEM_UPDATE_FAILED");
  await ctx.supabase.from("documents").update({ subtotal: totals.subtotal, discount: totals.discount, shipping: totals.shipping, total: totals.total }).eq("id", documentId).eq("organization_id", ctx.organizationId);
  return totals;
}

export async function confirmAgentDocument(ctx: AgentToolContext, documentId: string, explicitConfirmation: boolean) {
  if (!explicitConfirmation) throw new Error("EXPLICIT_CONFIRMATION_REQUIRED");
  const { data, error } = await ctx.supabase.from("documents").update({ status: "confirmed", confirmed_at: new Date().toISOString(), confirmed_by: ctx.userId })
    .eq("id", z.uuid().parse(documentId)).eq("organization_id", ctx.organizationId).eq("status", "draft").select("id,number").single();
  if (error || !data) {
    const { data: existing } = await ctx.supabase.from("documents").select("id,number,status,confirmed_at").eq("id", documentId).eq("organization_id", ctx.organizationId).maybeSingle();
    if (existing?.confirmed_at && ["confirmed", "generated", "sent"].includes(existing.status)) return existing;
    throw new Error("CONFIRM_FAILED");
  }
  await ctx.supabase.from("document_events").insert({ organization_id: ctx.organizationId, document_id: data.id, event_type: "agent.document.confirmed", actor_id: ctx.userId });
  return { ...data, pdfUrl: `/api/documents/${data.id}/pdf` };
}

export function getPdfUrl(documentId: string) { return `/api/documents/${z.uuid().parse(documentId)}/pdf`; }
