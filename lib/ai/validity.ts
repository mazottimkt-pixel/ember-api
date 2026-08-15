import type { AgentReviewSummary } from "./summary";

export type ValidityCollectionContext = {
  attempts: number;
  lastError?: string;
  friendlyText?: string;
};

export type AgentCollectionContext = {
  pendingIntentSwitch?: import("@/lib/conversation/intent-transition").PendingIntentSwitch;
  experience?: {
    introductionSeenAt: string;
    lastInteractionAt: string;
  };
  taskStateV1?: import("@/lib/agent-v1/task-state").TaskStateV1;
  activeTask?: import("@/lib/orchestrator/task-model").ActiveAdministrativeTask;
  expectedAnswer?: import("@/lib/ai/contextual-understanding").ExpectedAnswer;
  provenance?: Record<string,import("@/lib/ai/contextual-understanding").EntityProvenance>;
  activePrompt?: import("@/lib/navigation/conversation-prompts").ActiveConversationPrompt;
  hybrid?: import("@/lib/orchestrator/schemas").HybridContext;
  contentConversation?: import("@/lib/content/conversation").ContentConversation;
  navigation?: import("@/lib/navigation/menu-engine").MenuNavigationState;
  pendingField?: string;
  validity?: ValidityCollectionContext;
  summary?: AgentReviewSummary;
  correctionRequested?: boolean;
  confirmationAttempts?: number;
  party?: {
    source: "registered" | "ad_hoc";
    name: string;
    contactId?: string;
    taxId?: string;
    taxIdOmitted?: boolean;
    awaitingCnpjDecision?: boolean;
    awaitingCnpj?: boolean;
  };
  vaultSearch?: { query: string; results: Array<{ id: string; label: string }> };
  commercialInterpretation?: {
    entities: Record<string, { value: string | number | boolean; raw: string; source: "user_message"; confidence: number; normalized?: string; requiresConfirmation: boolean }>;
    pendingValueScope?: boolean;
  };
  branding?: {
    state: "offer" | "awaiting_logo" | "awaiting_template" | "awaiting_color" | "awaiting_approval" | "adjusting";
    resumeAction?: "create_quote" | "create_purchase_order";
    templateId?: "essential" | "executive" | "contemporary" | "commercial";
    primaryColor?: string;
    logoStoragePath?: string | null;
    preEmission?: boolean;
    afterSuccess?: boolean;
  };
};

export type ParsedValidity =
  | { success: true; canonical: string; friendlyText: string; kind: "duration" | "date"; value: number | string; unit?: "days"; display: string }
  | { success: false; reason: string };

const months: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

function unaccent(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

function isoToBr(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function addDays(today: string, days: number) {
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function organizationToday(now = new Date(), timeZone = "America/Sao_Paulo") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function absoluteDate(day: number, month: number, year: number, today: string): ParsedValidity {
  const canonical = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const date = new Date(`${canonical}T12:00:00Z`);
  if (date.toISOString().slice(0, 10) !== canonical)
    return { success: false, reason: "A data informada não existe no calendário.\n\nConfira o dia, o mês e o ano e envie novamente." };
  const currentYear = Number(today.slice(0, 4));
  if (year > currentYear + 10)
    return { success: false, reason: `A data informada ultrapassa o limite permitido.\n\nEscolha uma data até o ano de ${currentYear + 10}.` };
  if (canonical <= today)
    return { success: false, reason: "A validade precisa terminar depois da data de hoje.\n\nInforme uma nova data ou um prazo em dias." };
  return { success: true, canonical, friendlyText: `válido até ${isoToBr(canonical)}`, kind: "date", value: canonical, display: isoToBr(canonical) };
}

export function parseQuoteValidity(input: string, today = organizationToday()): ParsedValidity {
  const normalized = unaccent(input).replace(/[.!?]+$/g, "").trim();
  const numberWords: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, quinze: 15, trinta: 30 };
  if (/(?:validade\s+(?:de\s+)?|valid[oa]\s+por\s+|por\s+)?uma\s+semana\b/.test(normalized)) {
    const canonical = addDays(today, 7);
    return { success: true, canonical, friendlyText: `válido por 7 dias (até ${isoToBr(canonical)})`, kind: "duration", value: 7, unit: "days", display: "7 dias" };
  }
  const relative = /(?:validade\s+(?:de\s+)?|valid[oa]\s+por\s+|vence\s+em\s+|por\s+)?(-?\d{1,4}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|quinze|trinta)\s+dias?\b/.exec(normalized);
  if (relative) {
    const days = Number(relative[1]) || numberWords[relative[1]] || 0;
    if (days < 1) return { success: false, reason: "O prazo de validade precisa ser de pelo menos 1 dia.\n\nQual prazo deseja utilizar?" };
    if (days > 3650) return { success: false, reason: "O prazo informado é maior que o limite permitido de 10 anos.\n\nEnvie um prazo menor para continuarmos." };
    const canonical = addDays(today, days);
    const display = `${days} ${days === 1 ? "dia" : "dias"}`;
    return { success: true, canonical, friendlyText: `válido por ${display} (até ${isoToBr(canonical)})`, kind: "duration", value: days, unit: "days", display };
  }

  const numeric = /(?:validade\s+|valid[oa]\s+)?(?:ate\s+)?(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(normalized);
  if (numeric) return absoluteDate(Number(numeric[1]), Number(numeric[2]), Number(numeric[3]), today);

  const extended = /(?:validade\s+|valid[oa]\s+)?(?:ate\s+)?(\d{1,2})(?:\s+de)?\s+([a-z]+)(?:\s+de)?\s+(\d{4})\b/.exec(normalized);
  if (extended && months[extended[2]])
    return absoluteDate(Number(extended[1]), months[extended[2]], Number(extended[3]), today);

  return { success: false, reason: "Não consegui identificar a validade informada.\n\nVocê pode responder com um prazo, como *5 dias*, ou com uma data, como *10/08/2026*." };
}

export function asksForPreviousReason(input: string) {
  return /^(?:por\s+que(?:\s+nao)?|porque(?:\s+nao)?|qual\s+(?:e\s+)?o\s+motivo|motivo)\??$/i.test(unaccent(input));
}

export function validityErrorReply(reason: string, attempts: number) {
  const retry = "Informe novamente a validade para continuarmos.";
  const examples = "Você pode responder de uma destas formas:\n\n• 5 dias\n• válido por 7 dias\n• até 10/08/2026";
  return `${reason}\n\n${attempts >= 2 ? examples : retry}`;
}
