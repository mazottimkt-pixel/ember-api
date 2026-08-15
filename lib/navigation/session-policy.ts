import type { AgentDraft, AgentState } from "@/lib/ai/contracts";
import type { AgentCollectionContext } from "@/lib/ai/validity";
import { isPromptEligible } from "./conversation-prompts";

export const CONVERSATION_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export type ConversationLifecyclePhase =
  | "new_session"
  | "menu_selection"
  | "free_conversation"
  | "active_flow"
  | "pending_confirmation"
  | "pending_correction"
  | "pending_branding"
  | "completed_flow"
  | "cancelled_flow"
  | "stale_context"
  | "inconsistent_context";

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR").replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ").trim();

export function isExplicitNewSessionCommand(value: string) {
  return [
    "comecar novamente", "comecar de novo", "recomecar",
    "nova operacao", "iniciar nova operacao", "novo atendimento",
  ].includes(normalize(value));
}

export function isStandaloneGreeting(value: string) {
  return /^(?:ola|oi|bom dia|boa tarde|boa noite)(?: lume)?$/.test(normalize(value));
}

function isOlderThan(value: string | undefined, now: Date, ageMs: number) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && now.getTime() - timestamp > ageMs;
}

export function conversationLifecycle(input: {
  state: AgentState;
  draft: AgentDraft;
  collection: AgentCollectionContext;
  updatedAt?: string;
  now?: Date;
}): ConversationLifecyclePhase {
  const now = input.now ?? new Date();
  if (isOlderThan(input.updatedAt, now, CONVERSATION_STALE_AFTER_MS)) return "stale_context";
  if (input.collection.activePrompt && !isPromptEligible(input.collection.activePrompt, input.state, now))
    return "stale_context";
  if (input.state === "awaiting_confirmation" && (!input.collection.summary || input.collection.activePrompt?.promptType !== "confirmation"))
    return "inconsistent_context";
  if (input.collection.branding) return "pending_branding";
  if (input.collection.correctionRequested) return "pending_correction";
  if (input.state === "awaiting_confirmation") return "pending_confirmation";
  if (input.state === "confirmed") return "completed_flow";
  if (input.state === "cancelled") return "cancelled_flow";
  if (input.state === "collecting" || input.draft.type) return "active_flow";
  if (input.state === "menu" && input.collection.activePrompt?.promptType === "menu") return "menu_selection";
  if (input.state === "menu" && input.collection.activePrompt?.promptType === "greeting") return "new_session";
  return "free_conversation";
}

export function shouldStartNewSession(input: {
  message: string;
  state: AgentState;
  draft: AgentDraft;
  collection: AgentCollectionContext;
  updatedAt?: string;
  now?: Date;
}) {
  if (isExplicitNewSessionCommand(input.message)) return true;
  if (!isStandaloneGreeting(input.message)) return false;
  return ["stale_context", "inconsistent_context", "completed_flow", "cancelled_flow"]
    .includes(conversationLifecycle(input));
}
