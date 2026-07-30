import type { AgentDraft } from "./contracts";

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
