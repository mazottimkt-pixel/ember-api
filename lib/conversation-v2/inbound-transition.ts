import { conversationEventV2Schema, statePatchV2Schema } from "./contracts";
import { interpretInboundV2 } from "./interpreter";
import { reduceConversationV2 } from "./reducer";
import type { ConversationStateV2 } from "./schema";
import type { QueueJobV2 } from "./queue-contracts";
export function transitionQueuedInboundV2(
  state: ConversationStateV2,
  job: QueueJobV2,
) {
  const payload = job.payload as { text?: unknown },
    text = typeof payload.text === "string" ? payload.text : "",
    understood = interpretInboundV2(state, text);
  let type:
      | "INBOUND_TEXT"
      | "TASK_START"
      | "TASK_CANCEL"
      | "TASK_SWITCH_REQUESTED"
      | "INTERRUPTION_START"
      | "INTERRUPTION_COMPLETE"
      | "CONFIRMATION_ACCEPTED" = "INBOUND_TEXT",
    taskType:
      | undefined
      | "quote"
      | "purchase_order"
      | "administrative_query"
      | "vault_query";
  if (understood.interpretation.intent === "start_quote") {
    type = "TASK_START";
    taskType = "quote";
  } else if (understood.interpretation.intent === "start_purchase_order") {
    type = "TASK_START";
    taskType = "purchase_order";
  } else if (understood.interpretation.intent === "cancel")
    type = "TASK_CANCEL";
  else if (understood.interpretation.intent === "switch_task") {
    type = "TASK_SWITCH_REQUESTED";
    taskType =
      understood.interpretation.switchIntent === "purchase_order"
        ? "purchase_order"
        : "quote";
  } else if (understood.interpretation.intent === "interrupt") {
    type = "INTERRUPTION_START";
    taskType =
      understood.interpretation.interruptionIntent ?? "administrative_query";
  } else if (understood.interpretation.intent === "resume")
    type = "INTERRUPTION_COMPLETE";
  else if (understood.interpretation.intent === "confirm")
    type = "CONFIRMATION_ACCEPTED";
  const event = conversationEventV2Schema.parse({
      type,
      taskType,
      occurredAt: job.receivedAt,
      receivedAt: job.receivedAt,
      externalMessageId: job.externalMessageId,
    }),
    patch =
      type === "INBOUND_TEXT"
        ? understood.patch
        : statePatchV2Schema.parse({
            baseRevision: state.revision,
            operations: [],
          });
  const transition = reduceConversationV2(
    state,
    event,
    understood.interpretation,
    patch,
  );
  if (
    transition.nextState.revision === state.revision &&
    !["NOOP", "CLARIFY_REJECTED_PATCH", "STALE_INTERACTION"].includes(
      transition.nextAction,
    )
  ) {
    const revision = state.revision + 1;
    return {
      ...transition.nextState,
      revision,
      interaction: transition.nextState.interaction
        ? { ...transition.nextState.interaction, revision }
        : null,
      lastProcessedEvent: transition.nextState.lastProcessedEvent
        ? { ...transition.nextState.lastProcessedEvent, stateRevision: revision }
        : null,
    };
  }
  return transition.nextState;
}
