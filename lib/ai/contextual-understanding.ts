import type { AgentDraft } from "./contracts";
import { isPaymentOnlyDescription, parsePaymentDetails } from "@/lib/domain/payment-terms";

export type ExpectedAnswer = "document_type" | "counterparty" | "item_bundle" | "delivery_deadline" | "payment_terms" | "quote_validity" | "address" | "confirmation" | "price_scope" | "document_selection" | "correction";
export type EntityProvenance = { source: "user_current_message" | "user_previous_message" | "organization_profile" | "registered_contact" | "previous_document" | "vault_document" | "external_lookup" | "derived_calculation" | "inference"; confidence: "high" | "medium" | "low"; at: string };
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
const numberWords: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, vinte: 20, trinta: 30 };
const number = (raw: string) => Number(raw.replace(",", ".")) || numberWords[normalize(raw)];

export function expectedAnswerFor(draft: AgentDraft, pendingField?: string): ExpectedAnswer | undefined {
  const field = pendingField ?? (!draft.counterpartyName ? (draft.type ? "counterparty" : undefined) : !draft.items.length ? "item_bundle" : !draft.deadline ? "delivery_deadline" : !draft.paymentTerms ? "payment_terms" : draft.type === "quote" && !draft.validity ? "quote_validity" : draft.type === "purchase_order" && !draft.deliveryAddress ? "address" : undefined);
  return field === "cliente" || field === "fornecedor" ? "counterparty" : field === "itens" ? "item_bundle" : field === "prazo" ? "delivery_deadline" : field === "condição de pagamento" ? "payment_terms" : field === "validade" ? "quote_validity" : field === "endereço de entrega" ? "address" : field === "correção" ? "correction" : field as ExpectedAnswer | undefined;
}

export function parseItemBundle(text: string) {
  const normalized = normalize(text);
  const source = text.toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
  const naturalBundle = /^(?:s[aã]o\s+)?(\d+)\s+([\p{L}][\p{L}\s-]*?)[\s,]+(?:(?:a|por)\s+)?(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:reais?)?\s*cada(?:\s+um[ao]?)?\b/iu.exec(source);
  if (naturalBundle) {
    const description = naturalBundle[2].trim(); const quantity = number(naturalBundle[1]); const unitPrice = number(naturalBundle[3]);
    if (isPaymentOnlyDescription(description)) return undefined;
    const semanticDescription = normalize(description);
    const product = /\b(?:lampadas?|cadeiras?|notebooks?|materiais?|equipamentos?|produtos?)\b/.test(semanticDescription);
    const service = /\b(?:instalacao|manutencao|consultoria|design|pintura|servico)\b/.test(semanticDescription);
    return { description, quantity, unitPrice, total: quantity * unitPrice, itemType: product && !service ? "product" as const : service && !product ? "service" as const : product && service ? "mixed" as const : "unknown" as const };
  }
  const price = /(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:reais?)?\s*(?:cada(?:\s+um[ao]?)?|por\s+unidade)\b/i.exec(normalized);
  const quantity = /(\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|vinte|trinta)\s*(?:unidades?|un|unds?)\b/i.exec(normalized);
  if (!price || !quantity) return undefined;
  const quantityValue = number(quantity[1]); const unitPrice = number(price[1]);
  if (!quantityValue || !unitPrice) return undefined;
  const description = normalized.slice(0, quantity.index).replace(/^(?:sao|e|pra|para)\s+/i, "").trim().replace(/[,:-]+$/g, "").trim();
  if (!description || /^(?:unidades?|itens?|produtos?|servicos?)$/.test(description) || isPaymentOnlyDescription(description)) return undefined;
  const product = /\b(?:lampadas?|cadeiras?|notebooks?|materiais?|equipamentos?|produtos?)\b/.test(description);
  const service = /\b(?:instalacao|manutencao|consultoria|design|pintura|servico)\b/.test(description);
  return { description, quantity: quantityValue, unitPrice, total: quantityValue * unitPrice, itemType: product && !service ? "product" as const : service && !product ? "service" as const : product && service ? "mixed" as const : "unknown" as const };
}

export function parseDeadlineAnswer(text: string) { const match = /\b(\d{1,4})\s+dias?(?:\s+uteis)?\b/i.exec(normalize(text)); return match && Number(match[1]) > 0 ? `${Number(match[1])} dias${/uteis/i.test(text) ? " úteis" : ""}` : undefined; }
export function explicitQuantityCorrection(text: string) { const match = /(?:na verdade|corrig|troca|muda|sao|são)\D{0,20}(\d+)\s*(?:unidades?)?(?:\s+([\p{L}-]+))?/iu.exec(text); return match ? { quantity: Number(match[1]), description: match[2] } : undefined; }
export type ExplicitCorrection =
  | { target: "item"; description: string }
  | { target: "quantity"; quantity: number; description?: string }
  | { target: "payment"; payment: NonNullable<ReturnType<typeof parsePaymentDetails>> }
  | { target: "deadline"; deadline: string }
  | { target: "counterparty"; name: string };
export function parseExplicitCorrection(text: string): ExplicitCorrection | undefined {
  const normalized = normalize(text);
  const item = /(?:alterar|trocar|mudar|corrigir)\s+(?:o\s+)?item\s+(?:para|por)\s+(.+?)(?:\s+e\s+nao\s+.+)?[.!]?$/iu.exec(normalized);
  if (item?.[1]?.trim()) return { target: "item", description: item[1].trim().replace(/[.!]+$/g, "") };
  const payment = /(?:alterar|trocar|mudar|corrigir)\s+(?:o\s+)?pagamento\s+(?:para|por)\s+(.+)$/iu.exec(normalized);
  if (payment) { const parsed = parsePaymentDetails(payment[1]); if (parsed) return { target: "payment", payment: parsed }; }
  const deadline = /(?:alterar|trocar|mudar|corrigir)?\s*(?:o\s+)?prazo\s+(?:e|para|por)?\s*(\d{1,4}\s+dias?(?:\s+uteis)?)/iu.exec(normalized);
  if (deadline) return { target: "deadline", deadline: deadline[1] };
  const counterparty = /(?:alterar|trocar|mudar|corrigir)?\s*(?:o\s+)?(?:cliente|fornecedor)\s+(?:e|para|por)?\s*([\p{L}0-9 .&-]+)$/iu.exec(normalized);
  if (counterparty?.[1]?.trim()) return { target: "counterparty", name: counterparty[1].trim() };
  const quantity = explicitQuantityCorrection(text);
  return quantity ? { target: "quantity", ...quantity } : undefined;
}
export function paymentOnlyUpdate(text: string) { return parsePaymentDetails(text); }
export function counterpartyRoleConflict(text: string) { const normalized = normalize(text); if (/\borcamento\b/.test(normalized) && /\b(?:meu\s+)?fornecedor\b/.test(normalized)) { const name = /fornecedor\s+([\p{L}0-9 .&-]+?)(?:[,.]|$)/iu.exec(text)?.[1]?.trim(); return { name }; } return undefined; }
