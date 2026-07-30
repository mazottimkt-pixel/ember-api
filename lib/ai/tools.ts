import "server-only";
import { z } from "zod";
import { calculateDocument } from "@/lib/domain/calculations";
import type { AgentDraft } from "./contracts";

type Db = Awaited<ReturnType<typeof import("@/lib/supabase/server").createSupabaseServerClient>>;
export type AgentToolContext = { supabase: Db; organizationId: string; userId: string };

export async function findContact(ctx: AgentToolContext, name: string, role: "customer" | "supplier") {
  const query = ctx.supabase.from("business_contacts")
    .select("id,legal_name,is_customer,is_supplier")
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

export function locateMissingFields(draft: AgentDraft): string[] {
  if (draft.type === "document_search") return draft.documentQuery ? [] : ["termo da consulta"];
  const missing: string[] = [];
  if (!draft.type) missing.push("tipo de documento");
  if (!draft.counterpartyName) missing.push(draft.type === "purchase_order" ? "fornecedor" : "cliente");
  if (!draft.items.length) missing.push("itens");
  if (!draft.deadline) missing.push("prazo");
  if (!draft.paymentTerms) missing.push("condição de pagamento");
  if (draft.type === "quote" && !draft.validity) missing.push("validade");
  if (draft.type === "purchase_order" && !draft.deliveryAddress) missing.push("endereço de entrega");
  return missing;
}

export async function queryDocuments(ctx: AgentToolContext, query: string) {
  const safe = query.replace(/[%_,]/g, "");
  const { data, error } = await ctx.supabase.from("documents")
    .select("id,number,type,status,total,created_at")
    .eq("organization_id", ctx.organizationId).is("deleted_at", null)
    .or(`number.ilike.%${safe}%,status.ilike.%${safe}%`).order("created_at", { ascending: false }).limit(10);
  if (error) throw new Error("DOCUMENT_SEARCH_FAILED");
  return data ?? [];
}

export async function createAgentDraft(ctx: AgentToolContext, draft: AgentDraft, requestId: string) {
  if (draft.type !== "quote" && draft.type !== "purchase_order") throw new Error("INVALID_DOCUMENT_TYPE");
  const contacts = await findContact(ctx, draft.counterpartyName ?? "", draft.type === "quote" ? "customer" : "supplier");
  if (contacts.length !== 1) throw new Error(contacts.length ? "AMBIGUOUS_CONTACT" : "CONTACT_NOT_FOUND");
  const totals = calculateDocument(draft.items, draft.shipping ?? 0);
  const { data: number, error: numberError } = await ctx.supabase.rpc("next_document_number", { org_id: ctx.organizationId, doc_type: draft.type });
  if (numberError || !number) throw new Error("NUMBER_FAILED");
  const { data: document, error } = await ctx.supabase.from("documents").insert({
    organization_id: ctx.organizationId, request_id: requestId, type: draft.type, number, status: "draft",
    counterparty_id: contacts[0].id, customer_id: null, supplier_id: null,
    counterparty_snapshot: { id: contacts[0].id, name: contacts[0].legal_name },
    subtotal: totals.subtotal, discount: totals.discount, shipping: totals.shipping, total: totals.total,
    commercial_terms: { validity: draft.validity, deadline: draft.deadline, paymentTerms: draft.paymentTerms, deliveryAddress: draft.deliveryAddress },
    notes: draft.notes, issued_by: ctx.userId,
  }).select("id,number").single();
  if (error || !document) throw new Error("DRAFT_CREATE_FAILED");
  const rows = totals.items.map((item, index) => ({ organization_id: ctx.organizationId, document_id: document.id, position: index + 1, description: item.description, quantity: item.quantity, unit: item.unit, unit_price: item.unitPrice, discount: item.discount, line_total: item.lineTotal }));
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
  const { error } = await ctx.supabase.from("document_items").insert(totals.items.map((item, index) => ({ organization_id: ctx.organizationId, document_id: documentId, position: index + 1, description: item.description, quantity: item.quantity, unit: item.unit, unit_price: item.unitPrice, discount: item.discount, line_total: item.lineTotal })));
  if (error) throw new Error("ITEM_UPDATE_FAILED");
  await ctx.supabase.from("documents").update({ subtotal: totals.subtotal, discount: totals.discount, shipping: totals.shipping, total: totals.total }).eq("id", documentId).eq("organization_id", ctx.organizationId);
  return totals;
}

export async function confirmAgentDocument(ctx: AgentToolContext, documentId: string, explicitConfirmation: boolean) {
  if (!explicitConfirmation) throw new Error("EXPLICIT_CONFIRMATION_REQUIRED");
  const { data, error } = await ctx.supabase.from("documents").update({ status: "confirmed", confirmed_at: new Date().toISOString(), confirmed_by: ctx.userId })
    .eq("id", z.uuid().parse(documentId)).eq("organization_id", ctx.organizationId).eq("status", "draft").select("id,number").single();
  if (error || !data) throw new Error("CONFIRM_FAILED");
  await ctx.supabase.from("document_events").insert({ organization_id: ctx.organizationId, document_id: data.id, event_type: "agent.document.confirmed", actor_id: ctx.userId });
  return { ...data, pdfUrl: `/api/documents/${data.id}/pdf` };
}

export function getPdfUrl(documentId: string) { return `/api/documents/${z.uuid().parse(documentId)}/pdf`; }
