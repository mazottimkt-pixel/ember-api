import { agentDraftSchema, type AgentDraft, type AgentState } from "./contracts";
import { getAgentAIProvider } from "./openai-provider";
import { locateMissingFields } from "./missing";
import { confirmAgentDocument, createAgentDraft, queryDocuments, type AgentToolContext } from "./tools";

const questions: Record<string, string> = {
  "tipo de documento": "Você deseja criar um orçamento ou um pedido de compra?", cliente: "Qual é o nome do cliente?",
  fornecedor: "Qual é o nome do fornecedor?", itens: "Qual produto ou serviço deve constar, com quantidade e valor unitário?",
  prazo: "Qual é o prazo de entrega ou execução?", "condição de pagamento": "Qual é a condição de pagamento?",
  validade: "Qual é a data de validade do orçamento?", "endereço de entrega": "Qual é o endereço de entrega?",
  "termo da consulta": "Qual número, status ou termo devo procurar?",
};

function normalizeValidity(value: string | null) {
  if (!value) return value;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  const normalized = br ? `${br[3]}-${br[2]}-${br[1]}` : value;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) return null;
  const date = new Date(`${normalized}T12:00:00Z`);
  const year = Number(match[1]);
  return year >= new Date().getUTCFullYear() && year <= new Date().getUTCFullYear() + 10 && date.toISOString().slice(0, 10) === normalized ? normalized : null;
}

export type AgentTurnInput = { action: "message" | "confirm" | "correct" | "cancel"; text: string; idempotencyKey: string; state: AgentState; draft: AgentDraft; documentId?: string };

export async function runAgentTurn(ctx: AgentToolContext, input: AgentTurnInput) {
  let { state, draft, documentId } = input;
  let reply = ""; let provider = "server"; let documents: unknown[] | undefined;
  let metrics: ReturnType<NonNullable<import("./provider").AgentAIProvider["getLastMetrics"]>>;
  if (input.action === "cancel") { state = "cancelled"; reply = "Operação cancelada. Nenhum documento foi confirmado."; }
  else if (input.action === "correct") { state = "collecting"; reply = "Certo. Informe a correção desejada."; }
  else if (input.action === "confirm") {
    if (state !== "awaiting_confirmation") throw new Error("INVALID_CONFIRM_STATE");
    const confirmedDocumentId = documentId ?? (await createAgentDraft(ctx, draft, input.idempotencyKey)).id;
    documentId = confirmedDocumentId;
    const result = await confirmAgentDocument(ctx, confirmedDocumentId, true); state = "confirmed";
    reply = `Documento ${result.number} confirmado. O PDF está pronto para download.`;
  } else {
    const ai = getAgentAIProvider(); provider = ai.name;
    const decision = await ai.analyze(input.text, draft); metrics = ai.getLastMetrics?.();
    draft = agentDraftSchema.parse({ ...decision.draft, validity: normalizeValidity(decision.draft.validity) });
    if (decision.intent === "cancel") { state = "cancelled"; reply = "Operação cancelada. Nenhum documento foi confirmado."; }
    else if (draft.type === "document_search" && draft.documentQuery) {
      documents = await queryDocuments(ctx, draft.documentQuery); state = "collecting";
      reply = documents.length ? `Encontrei ${documents.length} documento(s).` : "Não encontrei documentos com esse termo.";
    } else {
      const missing = [...decision.ambiguities, ...locateMissingFields(draft)];
      state = missing.length ? "collecting" : "awaiting_confirmation";
      reply = missing.length ? (questions[missing[0]] ?? `Preciso confirmar: ${missing[0]}.`) : `${decision.reply}\n\nRevise o resumo e use Confirmar somente se estiver correto.`;
    }
  }
  return { state, draft, documentId, reply, provider, documents, metrics, pdfUrl: state === "confirmed" && documentId ? `/api/documents/${documentId}/pdf` : undefined };
}
