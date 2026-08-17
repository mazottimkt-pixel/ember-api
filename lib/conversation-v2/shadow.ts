import { createHash } from "node:crypto";
import { conversationEventV2Schema, statePatchV2Schema } from "./contracts";
import { interpretInboundV2 } from "./interpreter";
import { mapLegacyConversationToV2 } from "./legacy-mapper";
import { classifyConversationalQuality, classifyShadowWithOracle, type ConversationalOracleTelemetry, type ShadowOracleTelemetry } from "./oracle";
import { reduceConversationV2 } from "./reducer";
const NO_SIDE_EFFECTS={sideEffects:false as const};
const redact=(value:string)=>value.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,"<EMAIL>").replace(/\b\d{11,14}\b/g,"<ID>").replace(/\+?\d[\d\s().-]{9,}\d/g,"<PHONE>").slice(0,2000);
const safeUnknown=(value:unknown):unknown=>typeof value==="string"?redact(value):Array.isArray(value)?value.map(safeUnknown):value&&typeof value==="object"?Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([key,item])=>[key,safeUnknown(item)])):value;
const stateSummary=(state:import("./schema").ConversationStateV2)=>({revision:state.revision,taskType:state.activeTask.type,taskStatus:state.activeTask.status,expectedInput:state.interaction?.expectedInput??null,interactionType:state.interaction?.type??null,presentFields:{party:Boolean(state.draft.party),items:state.draft.items.length,payment:Boolean(state.draft.payment),deadline:Boolean(state.draft.deadline),validity:Boolean(state.draft.validity),address:Boolean(state.draft.address)},effects:state.effects});

export type ConversationV2ShadowAudit = {
  classification: string;
  conflicts: string[];
  legacy: { state: string; intent: string | null; nextAction: string | null; effect: string | null };
  v2: { state: string; intent: string; nextAction: string; interaction: string | null; effects: string[] };
  divergences: string[];
  sideEffects: false;
  oracle: ShadowOracleTelemetry;
  conversationalOracle: ConversationalOracleTelemetry;
  evidence: Record<string, unknown>;
};

export function runConversationV2Shadow(input: {
  organizationId: string;
  conversationKey: string;
  contactId?: string | null;
  legacyState: string;
  legacyContext: unknown;
  inbound: { text: string; externalMessageId: string; receivedAt: string };
  legacyResult: { state: string; reply?: string; draft?: { type?: string | null }; collection?: { activeTask?: { type?: string; nextAction?: string }; expectedAnswer?: string }; documentId?: string };
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
  const conversationalOracle=classifyConversationalQuality({userMessage:input.inbound.text,visibleReply:input.legacyResult.reply??null,stateBefore:input.legacyState,stateAfter:input.legacyResult.state,expectedInputBefore:mapped.state?.interaction?.expectedInput??null,expectedInputAfter:input.legacyResult.collection?.expectedAnswer??null});
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
      conversationalOracle,
      evidence:{maskedEventId:`…${input.inbound.externalMessageId.slice(-8)}`,conversationKeyHash:awaitlessHash(input.conversationKey),taskType:legacyIntent??"unknown",userMessage:redact(input.inbound.text),legacyVisibleReply:redact(input.legacyResult.reply??""),legacyStateBefore:input.legacyState,legacyStateAfter:input.legacyResult.state,legacyNextAction, v2Interpretation:null,v2StatePatch:null,v2StateBefore:null,v2StateAfter:null,v2Interaction:null,v2NextAction:"NONE",structuralClassification:mapped.classification,conversationalClassification:conversationalOracle.category,conversationalReason:conversationalOracle.reason},
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
    conversationalOracle,
    evidence:{maskedEventId:`…${input.inbound.externalMessageId.slice(-8)}`,conversationKeyHash:awaitlessHash(input.conversationKey),taskType:state.activeTask.type,userMessage:redact(input.inbound.text),legacyVisibleReply:redact(input.legacyResult.reply??""),legacyStateBefore:input.legacyState,legacyStateAfter:input.legacyResult.state,legacyNextAction,v2Interpretation:safeUnknown(understood.interpretation),v2StatePatch:safeUnknown(understood.patch),v2StateBefore:stateSummary(stateBefore),v2StateAfter:stateSummary(state),v2Interaction:safeUnknown(state.interaction),v2NextAction:transition.nextAction,structuralClassification:mapped.classification,conversationalClassification:conversationalOracle.category,conversationalReason:conversationalOracle.reason},
  };
}

function awaitlessHash(value:string){return createHash("sha256").update(value).digest("hex").slice(0,16);}
