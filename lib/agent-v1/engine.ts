import { formatBRL } from "@/lib/domain/calculations";
import { decideLumeAgentV1, type LumeAgentDecision } from "./decision";
import { applySemanticPatches } from "./patches";
import {
  createTaskState,
  taskStateV1Schema,
  validateTaskState,
  type TaskStateV1,
} from "./task-state";
export type AgentV1Turn = {
  task: TaskStateV1;
  decision: LumeAgentDecision;
  reply: string;
  patchFields: string[];
  rejectedPatchFields: string[];
  recoverable: boolean;
};
function replyFor(task: TaskStateV1, decision: LumeAgentDecision) {
  if (decision.intent === "greeting")
    return task.status === "completed"
      ? "Olá! Como posso ajudar?"
      : "Olá! Como posso ajudar? Se quiser, também posso continuar sua tarefa anterior.";
  if (decision.intent === "show_capabilities")
    return "Posso preparar orçamentos e pedidos de compra, localizar documentos, organizar arquivos administrativos e ajudar com consultas da empresa. Pode me dizer naturalmente o que precisa.";
  if (task.missingData[0] === "cliente")
    return "Para quem devo preparar o orçamento?";
  if (task.missingData[0] === "fornecedor")
    return "De qual fornecedor será a compra?";
  if (task.missingData[0] === "itens")
    return "Qual produto ou serviço, quantidade e valor unitário devo considerar?";
  if (task.missingData[0] === "prazo")
    return task.collectedData.itemType === "service"
      ? "Qual é o prazo de execução?"
      : "Qual é o prazo de entrega?";
  if (task.missingData[0] === "condição de pagamento")
    return "Qual será a forma de pagamento?";
  if (task.missingData[0] === "validade") {
    const total = task.collectedData.totalPrice;
    return `${total != null ? `Certo. O total fica em ${formatBRL(total)}.\n\n` : ""}Por quantos dias o orçamento deve permanecer válido?`;
  }
  if (task.missingData[0] === "endereço de entrega")
    return "Qual é o endereço de entrega?";
  if (task.status === "awaiting_confirmation")
    return "Perfeito. Os dados estão completos. Vou apresentar o resumo para sua confirmação.";
  return decision.ambiguities.length
    ? "Não consegui confirmar essa informação ainda. Pode detalhar um pouco mais?"
    : "Certo. Como posso continuar?";
}
export function runLumeAgentV1(input: {
  message: string;
  task?: TaskStateV1;
  today?: string;
  now?: Date;
}): AgentV1Turn {
  const now = input.now ?? new Date(),
    checked = input.task ? validateTaskState(input.task, now) : undefined,
    recoverable = checked?.classification === "CORRUPTED_RECOVERABLE",
    legacyContaminated = Boolean(
      input.task?.ambiguities.includes("legacy_context_contaminated"),
    ),
    safeTask =
      recoverable && checked?.task
        ? taskStateV1Schema.parse({
            ...checked.task,
            collectedData: {
              ...checked.task.collectedData,
              items: [],
              quotedItemDescription: null,
              totalPrice: null,
            },
            missingData: ["itens"],
            status: "collecting",
            currentQuestion: null,
          })
        : input.task,
    decision = decideLumeAgentV1(input.message, safeTask, input.today);
  if (
    safeTask &&
    decision.taskAction === "none" &&
    decision.patches.length === 0
  )
    return {
      task: safeTask,
      decision,
      reply: replyFor(safeTask, decision),
      patchFields: [],
      rejectedPatchFields: [],
      recoverable,
    };
  const type = decision.taskType ?? safeTask?.type ?? "administrative_query",
    startsFresh =
      decision.intent === "start_task" &&
      Boolean(decision.taskType) &&
      (recoverable ||
        legacyContaminated ||
        safeTask?.status === "completed" ||
        safeTask?.type !== decision.taskType),
    created =
      startsFresh || !safeTask ? createTaskState(type, { now }) : safeTask!,
    isExplicitItemCorrection = Boolean(
      safeTask?.collectedData.items.length &&
      decision.patches.some((p) => p.field === "item"),
    ),
    isCompositeAnswer = decision.patches.length > 1,
    base =
      startsFresh || !safeTask || isCompositeAnswer
        ? { ...created, currentQuestion: null }
        : isExplicitItemCorrection
          ? {
              ...created,
              currentQuestion: {
                type: "correction",
                promptId: `${created.id}:correction:${created.revision}`,
                taskId: created.id,
                revision: created.revision,
                allowedActions: [],
                askedAt: now.toISOString(),
              },
            }
          : created,
    applied = applySemanticPatches(base, decision.patches, now),
    task = applied.task;
  return {
    task,
    decision,
    reply: replyFor(task, decision),
    patchFields: applied.accepted,
    rejectedPatchFields: applied.rejected.map((item) => item.field),
    recoverable,
  };
}
export function compareAgentDecisions(input: {
  legacy: { intent?: string; nextAction?: string; draft?: unknown };
  agent: AgentV1Turn;
}) {
  const task = input.agent.task;
  return {
    intentDifferent: Boolean(
      input.legacy.intent &&
      input.legacy.intent !== input.agent.decision.intent,
    ),
    taskTypeDifferent: Boolean(
      (input.legacy.draft as { type?: string } | undefined)?.type &&
      (input.legacy.draft as { type?: string }).type !==
        task.collectedData.type,
    ),
    nextActionDifferent: Boolean(
      input.legacy.nextAction &&
      input.legacy.nextAction !== (task.currentQuestion?.type ?? task.status),
    ),
    agent: {
      intent: input.agent.decision.intent,
      taskType: task.type,
      nextAction: task.currentQuestion?.type ?? task.status,
      patchFields: input.agent.patchFields,
      rejectedPatchFields: input.agent.rejectedPatchFields,
    },
  };
}
