export type ShadowOracleCategory =
  | "V2_CORRECT_LEGACY_WRONG"
  | "LEGACY_CORRECT_V2_WRONG"
  | "BOTH_CORRECT"
  | "BOTH_WRONG"
  | "AMBIGUOUS";

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
