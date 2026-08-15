import { createHash } from "node:crypto";
import { calculateDocument, formatBRL } from "@/lib/domain/calculations";
import { agentDraftSchema, type AgentDraft } from "./contracts";
import { isPaymentOnlyDescription } from "@/lib/domain/payment-terms";

export type AgentReviewSummary = {
  draft: AgentDraft;
  fingerprint: string;
  text: string;
  presentedAt: string;
  version?: string;
  partyTaxId?: string | null;
};
export const AGENT_SUMMARY_VERSION = "commercial-summary-v2";

const quantity = (value: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(value);
const dateBR = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};
function validity(value: string, friendly?: string) {
  const relative = /^válido por (\d+ dias?) \(até (\d{2}\/\d{2}\/\d{4})\)$/.exec(friendly ?? "");
  return relative ? `${relative[1]} — até ${relative[2]}` : `até ${dateBR(value)}`;
}

export function fingerprintAgentDraft(value: AgentDraft) {
  return createHash("sha256").update(JSON.stringify(agentDraftSchema.parse(value))).digest("hex");
}

export function confirmationRequestId(organizationId: string, fingerprint: string, presentedAt: string) {
  const hex = createHash("sha256").update(`${organizationId}:${fingerprint}:${presentedAt}`).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function differingAgentDraftFields(left: AgentDraft, right: AgentDraft) {
  const a = agentDraftSchema.parse(left) as unknown;
  const b = agentDraftSchema.parse(right) as unknown;
  const paths: string[] = [];
  const walk = (one: unknown, two: unknown, path: string) => {
    if (Array.isArray(one) && Array.isArray(two)) {
      if (one.length !== two.length) paths.push(`${path}.quantidade`);
      for (let index = 0; index < Math.min(one.length, two.length); index += 1)
        walk(one[index], two[index], `${path}[${index + 1}]`);
    } else if (one && two && typeof one === "object" && typeof two === "object") {
      for (const key of new Set([...Object.keys(one), ...Object.keys(two)]))
        walk((one as Record<string, unknown>)[key], (two as Record<string, unknown>)[key], path ? `${path}.${key}` : key);
    } else if (!Object.is(one, two)) paths.push(path);
  };
  walk(a, b, "");
  return [...new Set(paths)];
}

export function buildAgentReviewSummary(draftInput: AgentDraft, options: { validityFriendlyText?: string; presentedAt?: string; partyTaxId?: string | null } = {}): AgentReviewSummary {
  const draft = agentDraftSchema.parse(draftInput);
  if (draft.type !== "quote" && draft.type !== "purchase_order") throw new Error("DOCUMENT_SUMMARY_TYPE_INVALID");
  const totals = calculateDocument(draft.items, draft.shipping ?? 0);
  const quote = draft.type === "quote";
  const lines = [`Revise os dados ${quote ? "do orçamento" : "do pedido de compra"}:`, "", `${quote ? "Cliente" : "Fornecedor"}: ${draft.counterpartyName ?? "Não informado"}`, `CNPJ: ${options.partyTaxId ?? "Não informado"}`, ""];
  totals.items.forEach((item) => {
    if(isPaymentOnlyDescription(item.description))throw new Error("PAYMENT_TERM_AS_ITEM_DESCRIPTION");
    const itemLabel=draft.itemType==="product"?"Produto":draft.itemType==="service"?"Serviço":draft.itemType==="mixed"?"Componente":"Descrição";
    lines.push(`${itemLabel}: ${item.description}`, `Quantidade: ${quantity(item.quantity)}`, `Valor unitário: ${formatBRL(item.unitPrice)}`);
    if (item.discount > 0) lines.push(`Desconto: ${formatBRL(item.discount)}`);
    lines.push(`Total: ${formatBRL(item.lineTotal)}`, "");
  });
  const needsAggregateTotals = totals.items.length > 1 || totals.discount > 0 || totals.shipping > 0;
  if (needsAggregateTotals) lines.push("Subtotal:", formatBRL(totals.subtotal));
  if (totals.discount > 0) lines.push("", "*Desconto*", formatBRL(totals.discount));
  if (totals.shipping > 0) lines.push("", "*Frete ou acréscimo*", formatBRL(totals.shipping));
  lines.push("", `Pagamento: ${draft.paymentTerms ?? "Não informado"}`);
  const deadlineLabel = draft.itemType === "product" ? "Prazo de entrega" : draft.itemType === "service" ? "Prazo de execução" : "Prazo de entrega ou execução";
  lines.push("", `${deadlineLabel}: ${draft.deadline ?? "Não informado"}`);
  if (quote && draft.validity) lines.push("", "*Validade*", validity(draft.validity, options.validityFriendlyText));
  if (!quote) lines.push("", `Endereço de entrega: ${draft.deliveryAddress ?? "Não informado"}`);
  if (draft.notes) lines.push("", `Observações: ${draft.notes}`);
  if (needsAggregateTotals) lines.push("", `Total: *${formatBRL(totals.total)}*`);
  const fingerprint = createHash("sha256").update(`${fingerprintAgentDraft(draft)}:${options.partyTaxId ?? "not-informed"}`).digest("hex");
  return { draft, fingerprint, text: lines.join("\n"), presentedAt: options.presentedAt ?? new Date().toISOString(), version: AGENT_SUMMARY_VERSION, partyTaxId: options.partyTaxId ?? null };
}

export function reviewMatchesDraft(review: AgentReviewSummary | undefined, draft: AgentDraft, partyTaxId?: string | null) {
  if (!review || review.version !== AGENT_SUMMARY_VERSION) return false;
  const expected = createHash("sha256").update(`${fingerprintAgentDraft(draft)}:${partyTaxId ?? "not-informed"}`).digest("hex");
  return review.fingerprint === expected && review.partyTaxId === (partyTaxId ?? null);
}
