import { emptyAgentDraft, type AgentDraft, type AgentState } from "@/lib/ai/contracts";

export type ConversationalIntent = "quote" | "purchase_order" | "document_query" | "vault_search" | "business_query" | "branding" | "free_administrative" | "cancel" | "resume";
export type IntentTransitionKind = "CONTINUE" | "CORRECTION" | "TEMPORARY_INTERRUPTION" | "SAFE_SWITCH" | "CONFIRM_SWITCH" | "CANCEL" | "RESUME";
export type PendingIntentSwitch = { from: "quote" | "purchase_order" | "document_search"; to: "quote" | "purchase_order" | "document_search"; requestedAt: string };
export type IntentTransitionDecision = { kind: IntentTransitionKind; current?: ConversationalIntent; requested?: ConversationalIntent; reason: string };

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

export function explicitRequestedIntent(message: string): ConversationalIntent | undefined {
  const value = normalize(message);
  if (/\b(?:cancelar|cancela|desistir|abandona(?:r)?|esquece(?: isso)?)\b/.test(value) && !/\b(?:orcamento|pedido de compra|documento)\b/.test(value)) return "cancel";
  if (/\b(?:continuar|continua|retomar|retoma|de onde paramos)\b/.test(value)) return "resume";
  if (/\b(?:qual|mostrar|mostre|consultar|consulta)\b.*\b(?:meu|minha|empresa|cnpj|dados)\b/.test(value)) return "business_query";
  if (/\b(?:manda|enviar|envie|buscar|busque|procurar|procure|localizar|localize)\b.*\b(?:arquivo|contrato|comprovante|documento)\b/.test(value)) return "vault_search";
  if (/\b(?:configurar|alterar|trocar|mudar|personalizar)\b.*\b(?:logo|identidade|modelo|documentos?)\b/.test(value)) return "branding";
  if (/\b(?:pedido de compra|criar pedido|fazer pedido|comprar)\b/.test(value)) return "purchase_order";
  if (/\b(?:orcamento|cotacao)\b/.test(value)) return "quote";
  if (/\b(?:consultar|buscar|localizar)\b.*\b(?:orcamento|pedido|documento)\b/.test(value)) return "document_query";
  return undefined;
}

const currentIntent = (draft: AgentDraft): ConversationalIntent | undefined => draft.type === "document_search" ? "document_query" : draft.type ?? undefined;

export function classifyIntentTransition(input: { message: string; state: AgentState; draft: AgentDraft; hasActivePrompt?: boolean; correctionRequested?: boolean }): IntentTransitionDecision {
  const current = currentIntent(input.draft), requested = explicitRequestedIntent(input.message), value = normalize(input.message);
  const active = input.state === "collecting" || input.state === "awaiting_confirmation";
  if (input.correctionRequested || /\b(?:na verdade|corrige|correcao|alterar apenas|troca o valor)\b/.test(value)) return { kind: "CORRECTION", current, requested, reason: "explicit_correction" };
  if (requested === "cancel") return { kind: "CANCEL", current, requested, reason: "explicit_cancel" };
  if (requested === "resume") return { kind: "RESUME", current, requested, reason: "explicit_resume" };
  if (active && (requested === "business_query" || requested === "vault_search")) return { kind: "TEMPORARY_INTERRUPTION", current, requested, reason: "bounded_query_during_active_task" };
  if (!requested || !current || requested === current) return { kind: "CONTINUE", current, requested, reason: input.hasActivePrompt ? "continues_active_decision" : "continues_active_task" };
  const material = requested === "quote" || requested === "purchase_order" || requested === "document_query";
  if (active && material) return { kind: "CONFIRM_SWITCH", current, requested, reason: "incompatible_active_task" };
  if (!active && material) return { kind: "SAFE_SWITCH", current, requested, reason: "previous_task_not_active" };
  return { kind: "CONTINUE", current, requested, reason: "non_material_topic_change" };
}

export function cleanDraftForIntent(intent: PendingIntentSwitch["to"]): AgentDraft { return { ...emptyAgentDraft(), type: intent }; }
export function switchLabels(pending: PendingIntentSwitch) { return { task: pending.to === "purchase_order" ? "pedido" : pending.to === "quote" ? "orçamento" : "consulta", current: pending.from === "purchase_order" ? "pedido" : pending.from === "quote" ? "orçamento" : "consulta" }; }
