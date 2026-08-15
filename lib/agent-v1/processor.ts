import { decodeBoundAction, validateBoundAction } from "./interactions";
import {
  beginInterruption,
  completeInterruption,
  confirmTask,
  presentTaskConfirmation,
} from "./lifecycle";
import { runLumeAgentV1 } from "./engine";
import { renderAgentV1, type AgentV1Rendered } from "./renderer";
import {
  executeRegisteredTool,
  type AgentV1ToolHandlers,
} from "./tool-registry";
import type { TaskStateV1 } from "./task-state";
import {
  createTaskState,
  currentQuestionSchema,
  taskStateV1Schema,
} from "./task-state";
import {
  applyPartyCandidates,
  chooseParty,
  completePartyTaxId,
  partyCandidateSchema,
} from "./party";
import { encodeBoundAction } from "./interactions";

export type AgentV1ProcessorOutput = {
  task: TaskStateV1;
  rendered: AgentV1Rendered;
  legacyAuthorityInvoked: false;
  toolExecuted: boolean;
  decision: ReturnType<typeof runLumeAgentV1>["decision"];
};
const executionMessage = (task: TaskStateV1) =>
  task.status === "completed"
    ? "Pronto. O documento foi emitido."
    : task.effects.document.status === "completed" &&
        task.effects.pdf.status === "failed_recoverable"
      ? "O documento foi criado, mas tive um problema ao preparar o PDF. Posso tentar novamente."
      : "O documento e o PDF estão prontos, mas tive um problema no envio. Posso tentar novamente.";
const executionRender = (task: TaskStateV1): AgentV1Rendered => {
  if (task.status === "completed")
    return {
      text: `${executionMessage(task)}\n\nQuer personalizar seus próximos documentos?`,
      buttons: [
        {
          id: encodeBoundAction({
            actionId: "personalize_now",
            taskId: task.id,
            revision: task.revision,
          }),
          label: "Personalizar",
        },
        {
          id: encodeBoundAction({
            actionId: "not_now",
            taskId: task.id,
            revision: task.revision,
          }),
          label: "Agora não",
        },
      ],
    };
  const actionId =
    task.effects.pdf.status === "failed_recoverable"
      ? "retry_pdf"
      : "retry_delivery";
  return {
    text: executionMessage(task),
    buttons: [
      {
        id: `v1:${actionId}:${task.id}:${task.revision}`,
        label:
          actionId === "retry_pdf"
            ? "Tentar PDF novamente"
            : "Tentar envio novamente",
      },
    ],
  };
};

export async function processAgentV1Turn(input: {
  message: string;
  buttonId?: string;
  task?: TaskStateV1;
  today?: string;
  now?: Date;
  brandingLogoRef?: string;
  tools: AgentV1ToolHandlers;
}): Promise<AgentV1ProcessorOutput> {
  const now = input.now ?? new Date(),
    bound = input.buttonId ? decodeBoundAction(input.buttonId) : undefined;
  if (bound && input.task) {
    const valid = validateBoundAction(input.task, bound),
      decision = runLumeAgentV1({
        message: input.message,
        task: input.task,
        today: input.today,
        now,
      }).decision;
    if (!valid.valid)
      return {
        task: input.task,
        rendered: { text: valid.reply },
        legacyAuthorityInvoked: false,
        toolExecuted: false,
        decision,
      };
    if (bound.actionId === "personalize_now") {
      const created = createTaskState("branding_setup", { now }),
        task = taskStateV1Schema.parse({
          ...created,
          status: "collecting",
          currentQuestion: currentQuestionSchema.parse({
            type: "brand_logo",
            promptId: `${created.id}:brand_logo:0`,
            taskId: created.id,
            revision: 0,
            allowedActions: [],
            askedAt: now.toISOString(),
          }),
        });
      return {
        task,
        rendered: { text: "Perfeito. Me envie sua logo aqui mesmo." },
        legacyAuthorityInvoked: false,
        toolExecuted: false,
        decision,
      };
    }
    if (bound.actionId === "not_now")
      return {
        task: input.task,
        rendered: {
          text: "Tudo certo. Quando quiser personalizar, é só me chamar.",
        },
        legacyAuthorityInvoked: false,
        toolExecuted: false,
        decision,
      };
    if (bound.actionId === "choose_party" && bound.entityId) {
      let task = chooseParty(input.task, bound.entityId, now);
      if (!task.missingData.length) task = presentTaskConfirmation(task, now);
      return {
        task,
        rendered: renderAgentV1(task, decision),
        legacyAuthorityInvoked: false,
        toolExecuted: false,
        decision,
      };
    }
    if (bound.actionId === "skip_cnpj") {
      let task = completePartyTaxId(input.task, undefined, now);
      if (!task.missingData.length) task = presentTaskConfirmation(task, now);
      return {
        task,
        rendered: renderAgentV1(task, decision),
        legacyAuthorityInvoked: false,
        toolExecuted: false,
        decision,
      };
    }
    if (bound.actionId === "include_cnpj") {
      const revision = input.task.revision + 1,
        task = taskStateV1Schema.parse({
          ...input.task,
          revision,
          currentQuestion: currentQuestionSchema.parse({
            type: "party_cnpj_input",
            promptId: `${input.task.id}:party_cnpj_input:${revision}`,
            taskId: input.task.id,
            revision,
            allowedActions: ["skip_cnpj"],
            askedAt: now.toISOString(),
          }),
        });
      return {
        task,
        rendered: { text: "Qual é o CNPJ da contraparte?" },
        legacyAuthorityInvoked: false,
        toolExecuted: false,
        decision,
      };
    }
    if (bound.actionId === "resume_task") {
      const task = completeInterruption(input.task);
      return {
        task,
        rendered: renderAgentV1(task, decision),
        legacyAuthorityInvoked: false,
        toolExecuted: false,
        decision,
      };
    }
    if (bound.actionId === "retry_pdf" || bound.actionId === "retry_delivery") {
      const retry = {
        ...input.task,
        status: "executing" as const,
        toolExecution: {
          ...input.task.toolExecution,
          status: "executing" as const,
          error: null,
          completedAt: null,
        },
      };
      const execution = await executeRegisteredTool(retry, input.tools, now);
      return {
        task: execution.task,
        rendered: executionRender(execution.task),
        legacyAuthorityInvoked: false,
        toolExecuted: execution.executed,
        decision,
      };
    }
    if (bound.actionId === "confirm_document") {
      if (input.task.toolExecution.status === "completed")
        return {
          task: input.task,
          rendered: { text: "Esse documento já foi emitido." },
          legacyAuthorityInvoked: false,
          toolExecuted: false,
          decision,
        };
      const execution = await executeRegisteredTool(
        confirmTask(input.task, {
          taskId: bound.taskId,
          revision: bound.revision,
          now,
        }),
        input.tools,
        now,
      );
      return {
        task: execution.task,
        rendered: executionRender(execution.task),
        legacyAuthorityInvoked: false,
        toolExecuted: execution.executed,
        decision,
      };
    }
  }
  if (
    input.task?.type === "branding_setup" &&
    input.task.currentQuestion?.type === "brand_logo" &&
    input.brandingLogoRef
  ) {
    const handler = input.tools.save_brand_logo;
    if (!handler) throw new Error("SAVE_BRAND_LOGO_NOT_REGISTERED");
    await handler(input.task, `${input.task.id}:logo`);
    const task = taskStateV1Schema.parse({
      ...input.task,
      status: "completed",
      currentQuestion: null,
      toolExecution: {
        ...input.task.toolExecution,
        toolId: "configure_branding",
        status: "completed",
        requestId: `${input.task.id}:logo`,
        resultRef: input.brandingLogoRef,
        completedAt: now.toISOString(),
      },
      timestamps: {
        ...input.task.timestamps,
        updatedAt: now.toISOString(),
        completedAt: now.toISOString(),
      },
    });
    return {
      task,
      rendered: {
        text: "Logo recebida e salva. Vou utilizá-la nos próximos documentos.",
      },
      legacyAuthorityInvoked: false,
      toolExecuted: true,
      decision: runLumeAgentV1({
        message: "logo recebida",
        task: input.task,
        today: input.today,
        now,
      }).decision,
    };
  }
  if (
    input.task?.status === "completed" &&
    /^(?:quero sim|pode colocar|vamos personalizar|personalizar)$/i.test(
      input.message.trim(),
    )
  ) {
    const created = createTaskState("branding_setup", { now }),
      task = taskStateV1Schema.parse({
        ...created,
        status: "collecting",
        currentQuestion: currentQuestionSchema.parse({
          type: "brand_logo",
          promptId: `${created.id}:brand_logo:0`,
          taskId: created.id,
          revision: 0,
          allowedActions: [],
          askedAt: now.toISOString(),
        }),
      }),
      decision = runLumeAgentV1({
        message: input.message,
        task: input.task,
        today: input.today,
        now,
      }).decision;
    return {
      task,
      rendered: { text: "Perfeito. Me envie sua logo aqui mesmo." },
      legacyAuthorityInvoked: false,
      toolExecuted: false,
      decision,
    };
  }
  if (
    input.task &&
    (input.task.currentQuestion?.type === "party_cnpj" ||
      input.task.currentQuestion?.type === "party_cnpj_input")
  ) {
    const digits = input.message.replace(/\D/g, "");
    if (
      /^(?:nao|não|sem cnpj|dispensar|pular)$/i.test(input.message.trim()) ||
      digits.length === 14
    ) {
      let task = completePartyTaxId(
        input.task,
        digits.length === 14 ? digits : undefined,
        now,
      );
      if (!task.missingData.length) task = presentTaskConfirmation(task, now);
      const decision = runLumeAgentV1({
        message: input.message,
        task: input.task,
        today: input.today,
        now,
      }).decision;
      return {
        task,
        rendered: renderAgentV1(task, decision),
        legacyAuthorityInvoked: false,
        toolExecuted: false,
        decision,
      };
    }
  }
  const turn = runLumeAgentV1({
    message: input.message,
    task: input.task,
    today: input.today,
    now,
  });
  let task = turn.task;
  if (turn.decision.intent === "answer_query" && input.task) {
    const kind =
      turn.decision.requestedTool === "find_organization_tax_id"
        ? "organization_tax_id"
        : turn.decision.requestedTool === "search_vault"
          ? "vault_search"
          : "general_question";
    task = beginInterruption(input.task, kind, now);
    const handler = turn.decision.requestedTool
      ? input.tools[turn.decision.requestedTool]
      : undefined;
    if (handler) {
      const result = await handler(task, `${task.id}:${task.revision}:${kind}`);
      return {
        task,
        rendered: renderAgentV1(task, turn.decision, {
          resultText: `${result.resultRef}\n\nQuer continuar a tarefa anterior?`,
        }),
        legacyAuthorityInvoked: false,
        toolExecuted: true,
        decision: turn.decision,
      };
    }
  }
  if (turn.decision.intent === "confirm_task" && input.task) {
    const execution = await executeRegisteredTool(
      confirmTask(input.task, {
        taskId: input.task.id,
        revision: input.task.revision,
        now,
      }),
      input.tools,
      now,
    );
    return {
      task: execution.task,
      rendered: executionRender(execution.task),
      legacyAuthorityInvoked: false,
      toolExecuted: execution.executed,
      decision: turn.decision,
    };
  }
  if (
    (task.type === "quote" || task.type === "purchase_order") &&
    task.collectedData.counterpartyName &&
    !task.party?.confirmed &&
    input.tools.resolve_party
  ) {
    const result = await input.tools.resolve_party(
        task,
        `${task.id}:${task.revision}:party`,
      ),
      candidates = partyCandidateSchema
        .array()
        .parse(JSON.parse(result.resultRef));
    task = applyPartyCandidates(task, candidates, now);
  }
  if (task.status === "awaiting_confirmation" && !task.currentQuestion)
    task = presentTaskConfirmation(task, now);
  return {
    task,
    rendered: renderAgentV1(task, turn.decision),
    legacyAuthorityInvoked: false,
    toolExecuted: false,
    decision: turn.decision,
  };
}
