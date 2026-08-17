export type ShadowOracleCategory =
  | "V2_CORRECT_LEGACY_WRONG"
  | "LEGACY_CORRECT_V2_WRONG"
  | "BOTH_CORRECT"
  | "BOTH_WRONG"
  | "AMBIGUOUS";

export const CONVERSATIONAL_QUALITY_CATEGORIES = [
  "CQ_PASS", "CQ_UNNECESSARY_QUESTION", "CQ_REPEATED_QUESTION", "CQ_WRONG_CONTEXT",
  "CQ_WRONG_INTENT", "CQ_LOST_INFORMATION", "CQ_BAD_CLARIFICATION", "CQ_ROBOTIC_FALLBACK",
  "CQ_INAPPROPRIATE_BUTTON", "CQ_FAILED_TO_PROGRESS", "CQ_FALSE_ASSUMPTION", "CQ_HALLUCINATION",
  "CQ_STATE_LEAK", "CQ_OTHER", "CQ_NEEDS_HUMAN_REVIEW",
] as const;
export type ConversationalQualityCategory = typeof CONVERSATIONAL_QUALITY_CATEGORIES[number];
export type ConversationalOracleTelemetry = {
  category: ConversationalQualityCategory;
  reason: string;
  passGrantedBy: "DETERMINISTIC_TRANSCRIPT" | null;
  constitutionRules: number[];
};

export type ShadowOracleTelemetry = {
  category: ShadowOracleCategory;
  expectedBehaviorSource:
    | "DETERMINISTIC_INVARIANT"
    | "CATALOG_TRANSCRIPT"
    | "STRUCTURAL_VALIDATION"
    | "MANUAL_REVIEW_REQUIRED";
  legacyInterpretation: { intent: string | null };
  v2Interpretation: { intent: string };
  legacyStateDelta: { from: string; to: string };
  v2StateDelta: { from: string; to: string };
  legacyNextAction: string | null;
  v2NextAction: string;
  activeInteraction: string | null;
};

export function classifyShadowWithOracle(input: {
  legacy: { intent: string | null; stateBefore: string; stateAfter: string; nextAction: string | null };
  v2: { intent: string; stateBefore: string; stateAfter: string; nextAction: string; interaction: string | null };
  mappingFailed: boolean;
  catalogExpected?: { intent?: string; nextAction?: string };
}): ShadowOracleTelemetry {
  let category: ShadowOracleCategory = "AMBIGUOUS";
  let expectedBehaviorSource: ShadowOracleTelemetry["expectedBehaviorSource"] = "MANUAL_REVIEW_REQUIRED";
  if (input.mappingFailed) {
    category = "LEGACY_CORRECT_V2_WRONG";
    expectedBehaviorSource = "DETERMINISTIC_INVARIANT";
  } else if (input.catalogExpected) {
    const legacyMatches = (!input.catalogExpected.intent || input.legacy.intent === input.catalogExpected.intent) && (!input.catalogExpected.nextAction || input.legacy.nextAction === input.catalogExpected.nextAction);
    const v2Matches = (!input.catalogExpected.intent || input.v2.intent === input.catalogExpected.intent) && (!input.catalogExpected.nextAction || input.v2.nextAction === input.catalogExpected.nextAction);
    category = legacyMatches && v2Matches ? "BOTH_CORRECT" : v2Matches ? "V2_CORRECT_LEGACY_WRONG" : legacyMatches ? "LEGACY_CORRECT_V2_WRONG" : "BOTH_WRONG";
    expectedBehaviorSource = "CATALOG_TRANSCRIPT";
  } else if (input.legacy.intent === input.v2.intent && input.legacy.stateAfter === input.v2.stateAfter) {
    category = "BOTH_CORRECT";
    expectedBehaviorSource = "STRUCTURAL_VALIDATION";
  }
  return {
    category,
    expectedBehaviorSource,
    legacyInterpretation: { intent: input.legacy.intent },
    v2Interpretation: { intent: input.v2.intent },
    legacyStateDelta: { from: input.legacy.stateBefore, to: input.legacy.stateAfter },
    v2StateDelta: { from: input.v2.stateBefore, to: input.v2.stateAfter },
    legacyNextAction: input.legacy.nextAction,
    v2NextAction: input.v2.nextAction,
    activeInteraction: input.v2.interaction,
  };
}

const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
export function classifyConversationalQuality(input: {
  userMessage: string;
  visibleReply: string | null;
  stateBefore: string;
  stateAfter: string;
  expectedInputBefore?: string | null;
  expectedInputAfter?: string | null;
  catalogExpectedReply?: string;
}): ConversationalOracleTelemetry {
  const user=normalized(input.userMessage),reply=normalized(input.visibleReply??"");
  if (!reply) return {category:"CQ_NEEDS_HUMAN_REVIEW",reason:"Resposta visível não foi persistida no corpus estrutural.",passGrantedBy:null,constitutionRules:[11]};
  if (input.catalogExpectedReply && reply === normalized(input.catalogExpectedReply)) return {category:"CQ_PASS",reason:"Resposta coincide com transcript humano previamente aprovado.",passGrantedBy:"DETERMINISTIC_TRANSCRIPT",constitutionRules:[1,2,3,11]};
  if (input.expectedInputBefore && input.expectedInputBefore===input.expectedInputAfter && input.stateBefore===input.stateAfter && /\?/.test(reply)) return {category:"CQ_REPEATED_QUESTION",reason:"O turno manteve o mesmo campo e repetiu uma pergunta sem progresso comprovado.",passGrantedBy:null,constitutionRules:[3,4,11]};
  if (/^(menu|escolha|digite|selecione)\b/.test(reply) && !/\b(menu|opcoes|opções)\b/.test(user)) return {category:"CQ_ROBOTIC_FALLBACK",reason:"A resposta converteu texto livre em navegação/formulário sem necessidade demonstrada.",passGrantedBy:null,constitutionRules:[1,9,10]};
  if (/\b(nao|não),? obrigado\b/.test(user) && input.stateAfter===input.stateBefore && /\?/.test(reply)) return {category:"CQ_WRONG_CONTEXT",reason:"Recusa contextual não foi resolvida e o fluxo anterior foi retomado.",passGrantedBy:null,constitutionRules:[12]};
  return {category:"CQ_NEEDS_HUMAN_REVIEW",reason:"Invariantes não provam adequação humana; revisão do transcript é obrigatória.",passGrantedBy:null,constitutionRules:[1,2,3,11]};
}
