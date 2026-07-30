import { NextResponse } from "next/server";
import { requireMembership } from "@/lib/auth/session";
import { agentDraftSchema, agentRequestSchema, emptyAgentDraft, type AgentState } from "@/lib/ai/contracts";
import { getAgentAIProvider } from "@/lib/ai/openai-provider";
import { confirmAgentDocument, createAgentDraft, queryDocuments, type AgentToolContext } from "@/lib/ai/tools";
import { locateMissingFields } from "@/lib/ai/missing";
import { normalizeAgentLabInput } from "@/lib/channels/agent-lab-adapter";

export const runtime = "nodejs";
const questions: Record<string, string> = {
  "tipo de documento": "Você deseja criar um orçamento ou um pedido de compra?", cliente: "Qual é o nome do cliente?",
  fornecedor: "Qual é o nome do fornecedor?", itens: "Qual produto ou serviço deve constar, com quantidade e valor unitário?",
  prazo: "Qual é o prazo de entrega ou execução?", "condição de pagamento": "Qual é a condição de pagamento?",
  validade: "Qual é a data de validade do orçamento?", "endereço de entrega": "Qual é o endereço de entrega?",
  "termo da consulta": "Qual número, status ou termo devo procurar?",
};

function publicError(error: unknown) {
  const code = error instanceof Error ? error.message : "UNKNOWN";
  if (code === "CONTACT_NOT_FOUND") return "Não encontrei esse cadastro. Confira o nome ou cadastre a contraparte.";
  if (code === "AMBIGUOUS_CONTACT") return "Encontrei cadastros semelhantes. Informe o nome completo ou CPF/CNPJ.";
  return "Não consegui concluir esta etapa. Seus dados foram preservados; tente novamente ou use o painel.";
}

function normalizeValidity(value: string | null) {
  if (!value) return value;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  const normalized = br ? `${br[3]}-${br[2]}-${br[1]}` : value;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) return null;
  const date = new Date(`${normalized}T12:00:00Z`);
  const year = Number(match[1]);
  if (year < new Date().getUTCFullYear() || year > new Date().getUTCFullYear() + 10 || date.toISOString().slice(0, 10) !== normalized) return null;
  return normalized;
}

export async function POST(request: Request) {
  const parsed = agentRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Solicitação inválida." }, { status: 400 });
  const { organizationId, supabase, user } = await requireMembership();
  const input = parsed.data;
  const channelMessage = normalizeAgentLabInput({ organizationId, userId: user.id, idempotencyKey: input.idempotencyKey, conversationId: input.conversationId, text: input.text });
  const { count } = await supabase.from("messages").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("direction", "inbound").gte("created_at", new Date(Date.now() - 60_000).toISOString());
  if ((count ?? 0) >= 20) return NextResponse.json({ error: "Limite temporário atingido. Aguarde um minuto." }, { status: 429 });
  const key = channelMessage.externalMessageId;
  const { data: duplicate } = await supabase.from("messages").select("conversation_id,content").eq("whatsapp_message_id", key).maybeSingle();
  if (duplicate) return NextResponse.json({ conversationId: duplicate.conversation_id, duplicate: true, ...((duplicate.content as { response?: object }).response ?? {}) });

  let conversation: { id: string; state: AgentState; context: Record<string, unknown> } | null = null;
  if (input.conversationId) {
    const result = await supabase.from("conversations").select("id,state,context").eq("id", input.conversationId).eq("organization_id", organizationId).maybeSingle();
    conversation = result.data as { id: string; state: AgentState; context: Record<string, unknown> };
  }
  if (!conversation) {
    const result = await supabase.from("conversations").insert({ organization_id: organizationId, user_id: user.id, whatsapp_contact_id: `agent-lab:${user.id}:${crypto.randomUUID()}`, state: "menu", context: { draft: emptyAgentDraft() } }).select("id,state,context").single();
    if (result.error || !result.data) return NextResponse.json({ error: "Não foi possível iniciar a conversa." }, { status: 500 });
    conversation = result.data as { id: string; state: AgentState; context: Record<string, unknown> };
  }
  if (!conversation) throw new Error("CONVERSATION_NOT_CREATED");
  await supabase.from("messages").insert({ organization_id: organizationId, conversation_id: conversation.id, whatsapp_message_id: key, direction: "inbound", kind: "text", content: { text: input.text, action: input.action }, processing_status: "processing" });
  const current = agentDraftSchema.catch(emptyAgentDraft()).parse(conversation.context.draft);
  let draft = current; let state: AgentState = conversation.state; let reply = ""; let provider = "server";
  let documentId = typeof conversation.context.documentId === "string" ? conversation.context.documentId : undefined;
  let metrics: ReturnType<NonNullable<import("@/lib/ai/provider").AgentAIProvider["getLastMetrics"]>>;
  let documents: unknown[] | undefined;
  const ctx: AgentToolContext = { organizationId, supabase, userId: user.id };
  try {
    if (input.action === "cancel") { state = "cancelled"; reply = "Operação cancelada. Nenhum documento foi confirmado."; }
    else if (input.action === "correct") { state = "collecting"; reply = "Certo. Informe a correção desejada."; }
    else if (input.action === "confirm") {
      if (state !== "awaiting_confirmation") return NextResponse.json({ error: "Revise todos os dados antes de confirmar." }, { status: 409 });
      const confirmedDocumentId = documentId ?? (await createAgentDraft(ctx, draft, input.idempotencyKey)).id;
      documentId = confirmedDocumentId;
      const result = await confirmAgentDocument(ctx, confirmedDocumentId, true); state = "confirmed";
      reply = `Documento ${result.number} confirmado. O PDF está pronto para download.`;
    } else {
      const ai = getAgentAIProvider(); provider = ai.name;
      const decision = await ai.analyze(input.text, current); metrics = ai.getLastMetrics?.();
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
  } catch (error) {
    console.error("agent.process.failed", { code: error instanceof Error ? error.message : "UNKNOWN", organizationId, conversationId: conversation.id });
    state = "error"; reply = publicError(error);
  }
  const payload = { reply, state, draft, documentId, documents, provider, metrics, pdfUrl: state === "confirmed" && documentId ? `/api/documents/${documentId}/pdf` : undefined };
  await supabase.from("conversations").update({ state, context: { draft, documentId }, updated_at: new Date().toISOString() }).eq("id", conversation.id).eq("organization_id", organizationId);
  await supabase.from("messages").update({ processing_status: "processed", content: { text: input.text, action: input.action, response: payload } }).eq("whatsapp_message_id", key).eq("organization_id", organizationId);
  await supabase.from("messages").insert({ organization_id: organizationId, conversation_id: conversation.id, whatsapp_message_id: `${key}:response`, direction: "outbound", kind: "text", content: { text: reply }, processing_status: "processed" });
  await supabase.from("audit_logs").insert({ organization_id: organizationId, actor_id: user.id, action: `agent.${input.action}`, entity_type: "conversation", entity_id: conversation.id, metadata: { state, provider, idempotencyKey: input.idempotencyKey, metrics } });
  return NextResponse.json({ conversationId: conversation.id, ...payload });
}
