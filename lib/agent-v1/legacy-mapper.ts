import {
  agentDraftSchema,
  emptyAgentDraft,
  type AgentDraft,
  type AgentState,
} from "@/lib/ai/contracts";
import type { AgentCollectionContext } from "@/lib/ai/validity";
import {
  isPaymentOnlyDescription,
  parsePaymentDetails,
} from "@/lib/domain/payment-terms";
import {
  createTaskState,
  refreshTaskState,
  taskStateV1Schema,
  validateTaskState,
  type TaskStateV1,
  type TaskStateValidation,
} from "./task-state";
export type LegacyConversationContext = {
  draft?: unknown;
  documentId?: unknown;
  collection?: AgentCollectionContext & { taskStateV1?: unknown };
};
export function mapLegacyContext(input: {
  state: AgentState;
  context: LegacyConversationContext;
  now?: Date;
}): {
  classification: TaskStateValidation;
  task: TaskStateV1;
  issues: string[];
  legacyConflict: boolean;
} {
  const existing = taskStateV1Schema.safeParse(
    input.context.collection?.taskStateV1,
  );
  if (existing.success) {
    const checked = validateTaskState(existing.data, input.now);
    return {
      classification: checked.classification,
      task: checked.task!,
      issues: checked.issues,
      legacyConflict: false,
    };
  }
  const parsed = agentDraftSchema.safeParse(input.context.draft),
    raw = parsed.success ? parsed.data : emptyAgentDraft(),
    issues: string[] = [];
  let draft: AgentDraft = raw;
  if (raw.items.some((item) => isPaymentOnlyDescription(item.description))) {
    issues.push("legacy_payment_term_as_item_description");
    draft = agentDraftSchema.parse({
      ...raw,
      items: [],
      quotedItemDescription: null,
      totalPrice: null,
      itemType: null,
    });
  }
  const payment = parsePaymentDetails(draft.paymentTerms ?? "");
  if (
    payment &&
    (!draft.paymentDetails || draft.paymentDetails.display !== payment.display)
  ) {
    issues.push("legacy_payment_normalized");
    draft = agentDraftSchema.parse({
      ...draft,
      paymentTerms: payment.display,
      paymentDetails: payment,
    });
  }
  const type =
      draft.type === "quote"
        ? "quote"
        : draft.type === "purchase_order"
          ? "purchase_order"
          : draft.type === "document_search"
            ? "document_search"
            : "administrative_query",
    base = createTaskState(type, { draft, now: input.now }),
    initial = refreshTaskState(
      { ...base, revision: -1 } as TaskStateV1,
      draft,
      input.now,
    ),
    legacyConflict = Boolean(
      input.context.collection?.summary ||
      input.context.collection?.expectedAnswer ||
      input.context.collection?.pendingField ||
      input.context.collection?.commercialInterpretation ||
      input.context.collection?.hybrid,
    ),
    task = taskStateV1Schema.parse({
      ...initial,
      ambiguities:
        issues.length || legacyConflict
          ? [...initial.ambiguities, "legacy_context_contaminated"]
          : initial.ambiguities,
    });
  return {
    classification: issues.length ? "CORRUPTED_RECOVERABLE" : "MIGRATABLE",
    task,
    issues: [
      ...issues,
      ...(legacyConflict ? ["legacy_parallel_authorities"] : []),
    ],
    legacyConflict,
  };
}
