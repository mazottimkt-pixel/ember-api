import { conversationEventV2Schema, statePatchV2Schema } from "./contracts";
import { interpretInboundV2 } from "./interpreter";
import { mapLegacyConversationToV2 } from "./legacy-mapper";
import { classifyShadowWithOracle, type ShadowOracleTelemetry } from "./oracle";
import { reduceConversationV2 } from "./reducer";
const NO_SIDE_EFFECTS={sideEffects:false as const};

export type ConversationV2ShadowAudit = {
  classification: string;
  conflicts: string[];
  legacy: { state: string; intent: string | null; nextAction: string | null; effect: string | null };
  v2: { state: string; intent: string; nextAction: string; interaction: string | null; effects: string[] };
  divergences: string[];
  sideEffects: false;
  oracle: ShadowOracleTelemetry;
};

export function runConversationV2Shadow(input: {
  organizationId: string;
  conversationKey: string;
  contactId?: string | null;
  legacyState: string;
  legacyContext: unknown;
  inbound: { text: string; externalMessageId: string; receivedAt: string };
  legacyResult: { state: string; draft?: { type?: string | null }; collection?: { activeTask?: { type?: string; nextAction?: string } }; documentId?: string };
  catalogExpected?: { intent?: string; nextAction?: string };
}): ConversationV2ShadowAudit {
  const mapped = mapLegacyConversationToV2({
    organizationId: input.organizationId,
    conversationKey: input.conversationKey,
    contactId: input.contactId,
    state: input.legacyState,
    context: input.legacyContext,
    now: input.inbound.receivedAt,
  });
  const legacyIntent = input.legacyResult.draft?.type ?? input.legacyResult.collection?.activeTask?.type ?? null;
  const legacyNextAction = input.legacyResult.collection?.activeTask?.nextAction ?? null;
  if (!mapped.state) {
    const oracle = classifyShadowWithOracle({
      legacy: { intent: legacyIntent, stateBefore: input.legacyState, stateAfter: input.legacyResult.state, nextAction: legacyNextAction },
      v2: { intent: "unknown", stateBefore: "unavailable", stateAfter: "unavailable", nextAction: "NONE", interaction: null },
      mappingFailed: true,
      catalogExpected: input.catalogExpected,
    });
    return {
      classification: mapped.classification,
      conflicts: mapped.conflicts,
      legacy: { state: input.legacyResult.state, intent: legacyIntent, nextAction: legacyNextAction, effect: input.legacyResult.documentId ? "document" : null },
      v2: { state: "unavailable", intent: "unknown", nextAction: "NONE", interaction: null, effects: [] },
      divergences: ["V2_MAPPING_FAILED"],
      ...NO_SIDE_EFFECTS,
      oracle,
    };
  }
  const stateBefore = mapped.state;
  const understood = interpretInboundV2(stateBefore, input.inbound.text);
  let eventType: "INBOUND_TEXT" | "TASK_START" | "TASK_CANCEL" | "TASK_SWITCH_REQUESTED" | "INTERRUPTION_START" | "INTERRUPTION_COMPLETE" | "CONFIRMATION_ACCEPTED" = "INBOUND_TEXT";
  let taskType: undefined | "quote" | "purchase_order" | "administrative_query" | "vault_query";
  if (understood.interpretation.intent === "start_quote") { eventType = "TASK_START"; taskType = "quote"; }
  else if (understood.interpretation.intent === "start_purchase_order") { eventType = "TASK_START"; taskType = "purchase_order"; }
  else if (understood.interpretation.intent === "cancel") eventType = "TASK_CANCEL";
  else if (understood.interpretation.intent === "switch_task") { eventType = "TASK_SWITCH_REQUESTED"; taskType = understood.interpretation.switchIntent === "purchase_order" ? "purchase_order" : "quote"; }
  else if (understood.interpretation.intent === "interrupt") { eventType = "INTERRUPTION_START"; taskType = understood.interpretation.interruptionIntent ?? "administrative_query"; }
  else if (understood.interpretation.intent === "resume") eventType = "INTERRUPTION_COMPLETE";
  else if (understood.interpretation.intent === "confirm") eventType = "CONFIRMATION_ACCEPTED";
  const event = conversationEventV2Schema.parse({ type: eventType, occurredAt: input.inbound.receivedAt, receivedAt: input.inbound.receivedAt, externalMessageId: input.inbound.externalMessageId, taskType });
  const transition = reduceConversationV2(
    stateBefore,
    event,
    understood.interpretation,
    eventType === "INBOUND_TEXT" ? understood.patch : statePatchV2Schema.parse({ baseRevision: stateBefore.revision, operations: [] }),
  );
  const state = transition.nextState;
  const divergences = [
    ...(legacyIntent && legacyIntent !== state.activeTask.type ? ["INTENT"] : []),
    ...(input.legacyResult.state !== state.activeTask.status ? ["STATE"] : []),
    ...(mapped.conflicts.length ? ["LEGACY_CONFLICTS"] : []),
  ];
  const oracle = classifyShadowWithOracle({
    legacy: { intent: legacyIntent, stateBefore: input.legacyState, stateAfter: input.legacyResult.state, nextAction: legacyNextAction },
    v2: { intent: state.activeTask.type, stateBefore: stateBefore.activeTask.status, stateAfter: state.activeTask.status, nextAction: transition.nextAction, interaction: state.interaction?.expectedInput ?? null },
    mappingFailed: false,
    catalogExpected: input.catalogExpected,
  });
  return {
    classification: mapped.classification,
    conflicts: mapped.conflicts,
    legacy: { state: input.legacyResult.state, intent: legacyIntent, nextAction: legacyNextAction, effect: input.legacyResult.documentId ? "document" : null },
    v2: { state: state.activeTask.status, intent: state.activeTask.type, nextAction: transition.nextAction, interaction: state.interaction?.expectedInput ?? null, effects: transition.effectsRequested.map((effect) => effect.effect) },
    divergences,
    ...NO_SIDE_EFFECTS,
    oracle,
  };
}
