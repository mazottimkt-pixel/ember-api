import { buildAgentReviewSummary } from "@/lib/ai/summary";
import { encodeBoundAction } from "./interactions";
import { partyCandidateSchema } from "./party";
import type { LumeAgentDecision } from "./decision";
import type { TaskStateV1 } from "./task-state";
export type AgentV1Rendered = {
  text: string;
  buttons?: Array<{ id: string; label: string }>;
  list?: {
    buttonLabel: string;
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>;
  };
  document?: { url: string; filename: string };
};
export function renderAgentV1(
  task: TaskStateV1,
  decision: LumeAgentDecision,
  input: {
    resultText?: string;
    document?: { url: string; filename: string };
  } = {},
): AgentV1Rendered {
  if (input.document)
    return {
      text: input.resultText ?? "Pronto. O documento foi emitido.",
      document: input.document,
    };
  if (decision.intent === "greeting")
    return {
      text: task.interruption
        ? "Olá! Sua tarefa continua salva. Quando quiser, podemos retomar."
        : "Olá! Como posso ajudar?",
    };
  if (decision.intent === "show_capabilities")
    return {
      text: `Posso preparar orçamentos e pedidos de compra, localizar documentos e organizar arquivos administrativos.${task.status === "collecting" || task.status === "awaiting_confirmation" ? "\n\nSua tarefa atual continua salva." : ""}`,
    };
  if (decision.intent === "answer_query")
    return {
      text: input.resultText ?? "Vou consultar essa informação.",
      buttons: task.interruption
        ? [
            {
              id: encodeBoundAction({
                actionId: "resume_task",
                taskId: task.id,
                revision: task.revision,
              }),
              label: "Retomar tarefa",
            },
          ]
        : undefined,
    };
  if (task.currentQuestion?.type === "confirm_document") {
    const summary = buildAgentReviewSummary(
      task.confirmation.presentedSnapshot ?? task.collectedData,
    );
    return {
      text: summary.text,
      buttons: [
        {
          id: encodeBoundAction({
            actionId: "confirm_document",
            taskId: task.id,
            revision: task.revision,
          }),
          label: task.type === "quote" ? "Emitir orçamento" : "Emitir pedido",
        },
        {
          id: encodeBoundAction({
            actionId: "correct_document",
            taskId: task.id,
            revision: task.revision,
          }),
          label: "Corrigir",
        },
        {
          id: encodeBoundAction({
            actionId: "cancel_document",
            taskId: task.id,
            revision: task.revision,
          }),
          label: "Cancelar",
        },
      ],
    };
  }
  const question = task.currentQuestion?.type;
  if (question === "choose_party") {
    const raw = task.ambiguities.find((item) =>
        item.startsWith("party_candidates:"),
      ),
      candidates = raw
        ? partyCandidateSchema
            .array()
            .parse(JSON.parse(raw.slice("party_candidates:".length)))
        : [];
    return {
      text: "Encontrei mais de uma contraparte. Qual delas devo usar?",
      list: {
        buttonLabel: "Escolher",
        sections: [
          {
            title: "Contrapartes",
            rows: candidates.map((item) => ({
              id: encodeBoundAction({
                actionId: "choose_party",
                taskId: task.id,
                revision: task.revision,
                entityId: item.contactId,
              }),
              title: item.name,
              description: item.documentNumber,
            })),
          },
        ],
      },
    };
  }
  if (question === "party_cnpj")
    return {
      text: `Deseja incluir o CNPJ de ${task.party?.name ?? "contraparte"}?`,
      buttons: [
        {
          id: encodeBoundAction({
            actionId: "include_cnpj",
            taskId: task.id,
            revision: task.revision,
          }),
          label: "Incluir CNPJ",
        },
        {
          id: encodeBoundAction({
            actionId: "skip_cnpj",
            taskId: task.id,
            revision: task.revision,
          }),
          label: "Sem CNPJ",
        },
      ],
    };
  if (question === "brand_logo")
    return { text: "Perfeito. Me envie sua logo aqui mesmo." };
  if (question === "counterparty")
    return {
      text:
        task.type === "purchase_order"
          ? "De qual fornecedor será a compra?"
          : "Para qual cliente devo preparar o orçamento?",
    };
  if (question === "item_bundle")
    return {
      text: "Qual produto ou serviço, quantidade e valor unitário devo considerar?",
    };
  if (question === "delivery_deadline")
    return {
      text:
        task.collectedData.itemType === "service"
          ? "Qual é o prazo de execução?"
          : "Qual é o prazo de entrega?",
    };
  if (question === "payment_terms")
    return { text: "Qual será a forma de pagamento?" };
  if (question === "quote_validity")
    return { text: "Por quantos dias o orçamento deve permanecer válido?" };
  if (question === "delivery_address")
    return { text: "Qual é o endereço de entrega?" };
  return { text: "Certo. Como posso continuar?" };
}
