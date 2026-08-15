import { z } from "zod";
import { taskStateV1Schema, type TaskStateV1 } from "./task-state";
import { failTaskTool } from "./lifecycle";

export const toolResultSchema = z.object({
  resultRef: z.string().min(1).max(1000),
});
export type AgentV1ToolResult = z.infer<typeof toolResultSchema>;
type Tool = (
  task: TaskStateV1,
  requestId: string,
) => Promise<AgentV1ToolResult>;
export type AgentV1ToolHandlers = {
  create_quote: Tool;
  create_purchase_order: Tool;
  generate_document_pdf?: Tool;
  send_document?: Tool;
  find_document?: Tool;
  find_organization_tax_id?: Tool;
  find_business_information?: Tool;
  search_vault?: Tool;
  configure_branding?: Tool;
  save_brand_logo?: Tool;
  resolve_party?: Tool;
};
export const AGENT_V1_TOOL_DEFINITIONS = {
  create_quote: {
    permission: "documents:create",
    idempotent: true,
    errorClass: "recoverable",
  },
  create_purchase_order: {
    permission: "documents:create",
    idempotent: true,
    errorClass: "recoverable",
  },
  generate_document_pdf: {
    permission: "documents:generate",
    idempotent: true,
    errorClass: "recoverable",
  },
  send_document: {
    permission: "messages:send",
    idempotent: true,
    errorClass: "recoverable",
  },
  find_business_information: {
    permission: "organization:read",
    idempotent: true,
    errorClass: "recoverable",
  },
  search_vault: {
    permission: "vault:read",
    idempotent: true,
    errorClass: "recoverable",
  },
  save_brand_logo: {
    permission: "branding:write",
    idempotent: true,
    errorClass: "recoverable",
  },
} as const;

const checkpoint = (
  task: TaskStateV1,
  key: "document" | "pdf" | "delivery",
  status: "executing" | "completed" | "failed_recoverable",
  now: Date,
  ref?: string,
  error?: string,
): TaskStateV1 => ({
  ...task,
  effects: {
    ...task.effects,
    [key]: {
      ...task.effects[key],
      status,
      ref: ref ?? task.effects[key].ref,
      error: error ?? null,
      updatedAt: now.toISOString(),
    },
  },
  timestamps: { ...task.timestamps, updatedAt: now.toISOString() },
});

export async function executeRegisteredTool(
  task: TaskStateV1,
  handlers: AgentV1ToolHandlers,
  now = new Date(),
) {
  if (task.status === "completed" || task.toolExecution.status === "completed")
    return {
      task,
      executed: false,
      resultRef: task.effects.delivery.ref ?? task.toolExecution.resultRef,
    };
  if (
    task.toolExecution.status !== "executing" ||
    !task.toolExecution.toolId ||
    !task.toolExecution.requestId
  )
    throw new Error("TASK_TOOL_NOT_READY");
  const requestId = task.toolExecution.requestId;
  let current = task;
  let executed = false;
  try {
    if (current.effects.document.status !== "completed") {
      const toolId = current.toolExecution.toolId;
      if (!toolId) throw new Error("TASK_TOOL_NOT_REGISTERED");
      const create = handlers[toolId];
      if (!create) throw new Error("TASK_TOOL_NOT_REGISTERED");
      current = checkpoint(current, "document", "executing", now);
      const result = toolResultSchema.parse(await create(current, requestId));
      executed = true;
      current = checkpoint(
        current,
        "document",
        "completed",
        now,
        result.resultRef,
      );
    }
    if (!handlers.generate_document_pdf) {
      return {
        task: taskStateV1Schema.parse({
          ...current,
          status: "completed",
          toolExecution: {
            ...current.toolExecution,
            status: "completed",
            resultRef: current.effects.document.ref,
            completedAt: now.toISOString(),
          },
          timestamps: { ...current.timestamps, completedAt: now.toISOString() },
        }),
        executed,
        resultRef: current.effects.document.ref,
      };
    }
    if (current.effects.pdf.status !== "completed") {
      current = checkpoint(current, "pdf", "executing", now);
      const result = toolResultSchema.parse(
        await handlers.generate_document_pdf(current, `${requestId}:pdf`),
      );
      executed = true;
      current = checkpoint(current, "pdf", "completed", now, result.resultRef);
    }
    if (!handlers.send_document)
      throw new Error("SEND_DOCUMENT_NOT_REGISTERED");
    if (current.effects.delivery.status !== "completed") {
      current = checkpoint(current, "delivery", "executing", now);
      const result = toolResultSchema.parse(
        await handlers.send_document(current, `${requestId}:delivery`),
      );
      executed = true;
      current = checkpoint(
        current,
        "delivery",
        "completed",
        now,
        result.resultRef,
      );
      current = {
        ...current,
        effects: {
          ...current.effects,
          delivery: { ...current.effects.delivery, wamid: result.resultRef },
        },
      };
    }
    current = taskStateV1Schema.parse({
      ...current,
      status: "completed",
      toolExecution: {
        ...current.toolExecution,
        status: "completed",
        resultRef: current.effects.document.ref,
        completedAt: now.toISOString(),
        error: null,
      },
      timestamps: {
        ...current.timestamps,
        updatedAt: now.toISOString(),
        completedAt: now.toISOString(),
      },
    });
    return { task: current, executed, resultRef: current.effects.delivery.ref };
  } catch (error) {
    const code = error instanceof Error ? error.message : "TASK_TOOL_FAILED";
    const key =
      current.effects.document.status !== "completed"
        ? "document"
        : current.effects.pdf.status !== "completed"
          ? "pdf"
          : "delivery";
    current = checkpoint(
      current,
      key,
      "failed_recoverable",
      now,
      undefined,
      code,
    );
    return {
      task: failTaskTool(current, code, true, now),
      executed: true,
      resultRef: null,
    };
  }
}
