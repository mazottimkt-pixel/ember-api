import { z } from "zod";
import {
  agentDraftSchema,
  emptyAgentDraft,
  type AgentDraft,
} from "@/lib/ai/contracts";
import {
  isPaymentOnlyDescription,
  parsePaymentDetails,
} from "@/lib/domain/payment-terms";
import { locateMissingFields } from "@/lib/ai/missing";

export const TASK_STATE_V1_VERSION = "lume-task-state-v1";
export const taskStatusSchema = z.enum([
  "understanding",
  "collecting",
  "awaiting_confirmation",
  "executing",
  "completed",
  "cancelled",
]);
export const taskTypeSchema = z.enum([
  "quote",
  "purchase_order",
  "document_search",
  "administrative_query",
  "branding",
  "branding_setup",
]);
export const partySchema = z.object({
  role: z.enum(["client", "supplier"]),
  source: z.enum(["registered", "ad_hoc"]),
  contactId: z.uuid().optional(),
  name: z.string().trim().min(2).max(160),
  documentNumber: z.string().trim().max(20).optional(),
  confirmed: z.boolean(),
});
const effectCheckpointSchema = z.object({
  status: z.enum(["pending", "executing", "completed", "failed_recoverable"]),
  ref: z.string().max(1000).nullable(),
  error: z.string().max(120).nullable(),
  updatedAt: z.string().datetime().nullable(),
});
export const effectsSchema = z.object({
  document: effectCheckpointSchema,
  pdf: effectCheckpointSchema,
  delivery: effectCheckpointSchema.extend({
    wamid: z.string().max(255).nullable(),
  }),
});
export const provenanceEntrySchema = z.object({
  source: z.enum([
    "user_current_message",
    "user_previous_message",
    "organization",
    "registered_contact",
    "previous_document",
    "vault",
    "external_lookup",
    "derived_calculation",
    "inference",
  ]),
  confidence: z.number().min(0).max(1),
  status: z
    .enum(["KNOWN", "INFERRED", "UNCERTAIN", "MISSING", "CONFIRMED"])
    .default("KNOWN"),
  confirmed: z.boolean().default(false),
  timestamp: z.string().datetime(),
  revision: z.number().int().nonnegative(),
});
export const currentQuestionSchema = z.object({
  type: z.string().min(1).max(80),
  promptId: z.string().min(1).max(240),
  taskId: z.uuid(),
  revision: z.number().int().nonnegative(),
  allowedActions: z.array(z.string().min(1).max(80)).max(12),
  askedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
});
export const confirmationSchema = z.object({
  status: z.enum(["not_required", "pending", "confirmed", "invalidated"]),
  taskId: z.uuid(),
  revision: z.number().int().nonnegative(),
  presentedSnapshot: agentDraftSchema.nullable(),
  fingerprint: z.string().max(128).nullable(),
  requestedAt: z.string().datetime().nullable(),
  confirmedAt: z.string().datetime().nullable(),
});
export const toolExecutionSchema = z.object({
  toolId: z
    .enum([
      "create_quote",
      "create_purchase_order",
      "find_document",
      "find_organization_tax_id",
      "search_vault",
      "configure_branding",
    ])
    .nullable(),
  status: z.enum([
    "not_requested",
    "pending_confirmation",
    "executing",
    "completed",
    "failed_recoverable",
    "failed_terminal",
  ]),
  requestId: z.string().max(200).nullable(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  resultRef: z.string().max(300).nullable(),
  error: z.string().max(120).nullable(),
});
export const interruptionSchema = z.object({
  kind: z.enum([
    "organization_tax_id",
    "vault_search",
    "document_search",
    "greeting",
    "capabilities",
    "general_question",
  ]),
  requestedAt: z.string().datetime(),
  resumeQuestion: currentQuestionSchema.nullable(),
  status: z.enum(["pending", "completed", "cancelled"]),
});
export const taskStateV1Schema = z.object({
  id: z.uuid(),
  version: z.literal(TASK_STATE_V1_VERSION),
  type: taskTypeSchema,
  status: taskStatusSchema,
  collectedData: agentDraftSchema,
  party: partySchema.nullable().default(null),
  missingData: z.array(z.string().max(80)),
  ambiguities: z.array(z.string().max(240)),
  currentQuestion: currentQuestionSchema.nullable(),
  confirmation: confirmationSchema,
  toolExecution: toolExecutionSchema,
  effects: effectsSchema.default({
    document: { status: "pending", ref: null, error: null, updatedAt: null },
    pdf: { status: "pending", ref: null, error: null, updatedAt: null },
    delivery: {
      status: "pending",
      ref: null,
      error: null,
      updatedAt: null,
      wamid: null,
    },
  }),
  interruption: interruptionSchema.nullable(),
  revision: z.number().int().nonnegative(),
  provenance: z.record(z.string(), provenanceEntrySchema),
  timestamps: z.object({
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    completedAt: z.string().datetime().optional(),
  }),
});
export type TaskStateV1 = z.infer<typeof taskStateV1Schema>;
export type TaskStateValidation =
  | "VALID"
  | "MIGRATABLE"
  | "STALE"
  | "CORRUPTED_RECOVERABLE"
  | "CORRUPTED_FATAL";

const questionType = (field?: string) =>
  field === "cliente" || field === "fornecedor"
    ? "counterparty"
    : field === "itens"
      ? "item_bundle"
      : field === "prazo"
        ? "delivery_deadline"
        : field === "condição de pagamento"
          ? "payment_terms"
          : field === "validade"
            ? "quote_validity"
            : field === "endereço de entrega"
              ? "delivery_address"
              : (field ?? null);
export function createTaskState(
  type: TaskStateV1["type"],
  input: { draft?: AgentDraft; now?: Date; id?: string } = {},
): TaskStateV1 {
  const now = (input.now ?? new Date()).toISOString(),
    nonCommercial =
      type === "administrative_query" ||
      type === "branding" ||
      type === "branding_setup",
    draft = agentDraftSchema.parse({
      ...emptyAgentDraft(),
      ...input.draft,
      type: nonCommercial ? (input.draft?.type ?? null) : type,
    }),
    missing =
      type === "quote" || type === "purchase_order"
        ? locateMissingFields(draft)
        : [],
    id = input.id ?? crypto.randomUUID(),
    current = questionType(missing[0]),
    party =
      draft.counterpartyName && !nonCommercial
        ? {
            role: type === "purchase_order" ? "supplier" : "client",
            source: "ad_hoc",
            name: draft.counterpartyName,
            confirmed: false,
          }
        : null;
  return taskStateV1Schema.parse({
    id,
    version: TASK_STATE_V1_VERSION,
    type,
    status: missing.length ? "collecting" : "awaiting_confirmation",
    collectedData: draft,
    party,
    missingData: missing,
    ambiguities: [],
    currentQuestion: current
      ? {
          type: current,
          promptId: `${id}:${current}:0`,
          taskId: id,
          revision: 0,
          allowedActions: [],
          askedAt: now,
        }
      : null,
    confirmation: {
      status: missing.length ? "invalidated" : "pending",
      taskId: id,
      revision: 0,
      presentedSnapshot: null,
      fingerprint: null,
      requestedAt: null,
      confirmedAt: null,
    },
    toolExecution: {
      toolId: null,
      status: "not_requested",
      requestId: null,
      startedAt: null,
      completedAt: null,
      resultRef: null,
      error: null,
    },
    interruption: null,
    revision: 0,
    provenance: {},
    timestamps: { createdAt: now, updatedAt: now },
  });
}

export function validateTaskState(
  input: unknown,
  now = new Date(),
): {
  classification: TaskStateValidation;
  task?: TaskStateV1;
  issues: string[];
} {
  const parsed = taskStateV1Schema.safeParse(input);
  if (!parsed.success)
    return {
      classification: "CORRUPTED_FATAL",
      issues: parsed.error.issues.map((issue) => issue.path.join(".")),
    };
  const task = parsed.data,
    issues: string[] = [];
  if (
    task.currentQuestion &&
    (task.currentQuestion.taskId !== task.id ||
      task.currentQuestion.revision !== task.revision)
  )
    issues.push("current_question_revision_mismatch");
  if (
    task.collectedData.items.some((item) =>
      isPaymentOnlyDescription(item.description),
    )
  )
    issues.push("payment_term_as_item_description");
  if (
    task.collectedData.paymentTerms &&
    !task.collectedData.paymentDetails &&
    parsePaymentDetails(task.collectedData.paymentTerms)
  )
    issues.push("payment_details_missing");
  if (task.status === "awaiting_confirmation" && task.missingData.length)
    issues.push("confirmation_with_missing_data");
  if (
    now.getTime() - Date.parse(task.timestamps.updatedAt) >
    24 * 60 * 60 * 1000
  )
    return { classification: "STALE", task, issues: [...issues, "task_stale"] };
  return {
    classification: issues.length ? "CORRUPTED_RECOVERABLE" : "VALID",
    task,
    issues,
  };
}

export function refreshTaskState(
  taskInput: TaskStateV1,
  draftInput: AgentDraft,
  now = new Date(),
): TaskStateV1 {
  const draft = agentDraftSchema.parse(draftInput),
    missing =
      taskInput.type === "quote" || taskInput.type === "purchase_order"
        ? locateMissingFields(draft)
        : [],
    revision = taskInput.revision + 1,
    current = questionType(missing[0]),
    timestamp = now.toISOString(),
    party = draft.counterpartyName
      ? {
          role:
            taskInput.type === "purchase_order"
              ? ("supplier" as const)
              : ("client" as const),
          source: taskInput.party?.source ?? ("ad_hoc" as const),
          contactId: taskInput.party?.contactId,
          name: draft.counterpartyName,
          documentNumber: taskInput.party?.documentNumber,
          confirmed:
            taskInput.party?.name === draft.counterpartyName &&
            Boolean(taskInput.party.confirmed),
        }
      : null;
  return taskStateV1Schema.parse({
    ...taskInput,
    collectedData: draft,
    party,
    missingData: missing,
    status: missing.length ? "collecting" : "awaiting_confirmation",
    revision,
    currentQuestion: current
      ? {
          type: current,
          promptId: `${taskInput.id}:${current}:${revision}`,
          taskId: taskInput.id,
          revision,
          allowedActions: [],
          askedAt: timestamp,
        }
      : null,
    confirmation: {
      status: missing.length ? "invalidated" : "pending",
      taskId: taskInput.id,
      revision,
      presentedSnapshot: null,
      fingerprint: null,
      requestedAt: null,
      confirmedAt: null,
    },
    toolExecution:
      taskInput.toolExecution.status === "completed"
        ? taskInput.toolExecution
        : {
            toolId: null,
            status: "not_requested",
            requestId: null,
            startedAt: null,
            completedAt: null,
            resultRef: null,
            error: null,
          },
    timestamps: { ...taskInput.timestamps, updatedAt: timestamp },
  });
}
