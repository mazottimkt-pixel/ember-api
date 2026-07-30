import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emptyAgentDraft, agentDraftSchema, type AgentState } from "@/lib/ai/contracts";
import { getAgentAIProvider } from "@/lib/ai/openai-provider";
import { runAgentTurn } from "@/lib/ai/turn";
import type { AgentToolContext } from "@/lib/ai/tools";
import { normalizedOutboundSchema, type NormalizedInbound, type NormalizedOutbound } from "@/lib/channels/contracts";
import { WhatsAppChannelAdapter, shouldAdvanceWhatsAppStatus, type ParsedWhatsAppEvent, type WhatsAppStatus } from "@/lib/channels/whatsapp-adapter";
import { withBackoff } from "@/lib/channels/queue";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const actionFor = (message: NormalizedInbound) => message.kind === "button" && ["confirm", "correct", "cancel"].includes(message.buttonId ?? "") ? message.buttonId as "confirm" | "correct" | "cancel" : "message";
const humanText = "Não consegui concluir esta etapa automaticamente. Um responsável deverá continuar o atendimento.";

async function deliverWithRetry(adapter: WhatsAppChannelAdapter, output: NormalizedOutbound) {
  return withBackoff(() => adapter.deliver(output), { attempts: 3, baseDelayMs: 500,
    shouldRetry: (error) => error instanceof Error && "retryable" in error && Boolean((error as { retryable?: boolean }).retryable) });
}

async function claim(admin: SupabaseClient, message: NormalizedInbound) {
  const { error } = await admin.from("channel_message_jobs").insert({ organization_id: message.organizationId, channel: message.channel,
    external_message_id: message.externalMessageId, external_conversation_id: message.externalConversationId, kind: message.kind,
    normalized_payload: message, processing_status: "received", received_at: message.receivedAt });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error("CHANNEL_JOB_CLAIM_FAILED");
}

async function updateJob(admin: SupabaseClient, message: NormalizedInbound, status: "processing" | "responded" | "failed", errorCode?: string) {
  await admin.from("channel_message_jobs").update({ processing_status: status, error_code: errorCode ?? null, processed_at: status === "processing" ? null : new Date().toISOString() })
    .eq("channel", message.channel).eq("external_message_id", message.externalMessageId).eq("organization_id", message.organizationId);
}

export async function processWhatsAppEvent(event: ParsedWhatsAppEvent) {
  const admin = createSupabaseAdminClient();
  const { data: channel } = await admin.from("whatsapp_channels").select("organization_id").eq("phone_number_id", event.phoneNumberId).eq("active", true).maybeSingle();
  if (!channel) return { ignored: "CHANNEL_NOT_REGISTERED" as const };
  const { data: member } = await admin.from("organization_members").select("user_id").eq("organization_id", channel.organization_id).order("created_at").limit(1).maybeSingle();
  if (!member) return { ignored: "ORGANIZATION_WITHOUT_MEMBER" as const };
  const adapter = new WhatsAppChannelAdapter({ phoneNumberId: event.phoneNumberId });
  const message = adapter.normalize({ event, organizationId: channel.organization_id, actorId: member.user_id });
  if (!(await claim(admin, message))) return { duplicate: true as const };
  if (message.kind === "status") {
    const target = String(message.metadata.targetMessageId ?? "");
    const next = message.metadata.status as WhatsAppStatus | undefined;
    if (target && next) {
      const { data: prior } = await admin.from("messages").select("delivery_status").eq("organization_id", message.organizationId).eq("whatsapp_message_id", target).maybeSingle();
      if (prior && shouldAdvanceWhatsAppStatus(prior.delivery_status as WhatsAppStatus | null, next))
        await admin.from("messages").update({ delivery_status: next, delivery_status_updated_at: message.receivedAt }).eq("organization_id", message.organizationId).eq("whatsapp_message_id", target);
    }
    await updateJob(admin, message, "responded"); return { status: true as const };
  }
  const lockKey = `${message.organizationId}:${message.externalConversationId}`;
  const { data: locked } = await admin.rpc("acquire_channel_lock", { p_lock_key: lockKey, p_organization_id: message.organizationId, p_lease_seconds: 60 });
  if (!locked) return { deferred: true as const };
  try {
    await updateJob(admin, message, "processing");
    const contactKey = `whatsapp:${event.phoneNumberId}:${message.externalConversationId}`;
    let { data: conversation } = await admin.from("conversations").select("id,state,context").eq("organization_id", message.organizationId).eq("whatsapp_contact_id", contactKey).maybeSingle();
    if (!conversation) {
      const created = await admin.from("conversations").insert({ organization_id: message.organizationId, user_id: member.user_id, whatsapp_contact_id: contactKey, state: "menu", context: { draft: emptyAgentDraft() } }).select("id,state,context").single();
      if (created.error || !created.data) throw new Error("CONVERSATION_NOT_CREATED");
      conversation = created.data;
    }
    let text = message.text ?? "";
    let transcriptionMetrics: unknown;
    if (message.kind === "audio") {
      const file = await adapter.downloadAudio(message.mediaReference ?? "");
      const ai = getAgentAIProvider();
      text = await ai.transcribe(file); transcriptionMetrics = ai.getLastMetrics?.();
    }
    if (!text) throw new Error("WHATSAPP_MESSAGE_WITHOUT_TEXT");
    const context = conversation.context as Record<string, unknown>;
    const draft = agentDraftSchema.catch(emptyAgentDraft()).parse(context.draft);
    const state = conversation.state as AgentState;
    const ctx: AgentToolContext = { organizationId: message.organizationId, supabase: admin as AgentToolContext["supabase"], userId: member.user_id };
    const result = await runAgentTurn(ctx, { action: actionFor(message), text, idempotencyKey: message.externalMessageId, state, draft, documentId: typeof context.documentId === "string" ? context.documentId : undefined });
    await admin.from("conversations").update({ state: result.state, context: { draft: result.draft, documentId: result.documentId }, updated_at: new Date().toISOString() }).eq("id", conversation.id).eq("organization_id", message.organizationId);
    const buttons = result.state === "awaiting_confirmation" ? [{ id: "confirm", label: "Confirmar" }, { id: "correct", label: "Corrigir" }, { id: "cancel", label: "Cancelar" }] : undefined;
    const output = normalizedOutboundSchema.parse({ channel: "whatsapp", conversationId: message.externalConversationId, kind: "text", text: result.reply, buttons, replyToExternalMessageId: message.externalMessageId, metadata: { state: result.state } });
    const sent = await deliverWithRetry(adapter, output);
    await admin.from("messages").insert({ organization_id: message.organizationId, conversation_id: conversation.id, whatsapp_message_id: sent.externalMessageId, direction: "outbound", kind: "text", content: { state: result.state }, processing_status: "processed" });
    await admin.from("audit_logs").insert({ organization_id: message.organizationId, actor_id: member.user_id, action: "whatsapp.message.processed", entity_type: "conversation", entity_id: conversation.id,
      metadata: { inboundMessageId: message.externalMessageId, outboundMessageId: sent.externalMessageId, provider: result.provider, metrics: result.metrics, transcriptionMetrics, status: result.state } });
    await updateJob(admin, message, "responded");
    return { processed: true as const };
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    await updateJob(admin, message, "failed", code.slice(0, 80));
    const fallback = normalizedOutboundSchema.parse({ channel: "whatsapp", conversationId: message.externalConversationId!, kind: "text", text: humanText, metadata: { handoff: true } });
    await adapter.deliver(fallback).catch(() => undefined);
    console.error("whatsapp.process.failed", { code, organizationId: message.organizationId, kind: message.kind });
    return { failed: true as const };
  } finally {
    await admin.rpc("release_channel_lock", { p_lock_key: lockKey, p_organization_id: message.organizationId });
  }
}

export async function processWhatsAppEvents(events: ParsedWhatsAppEvent[]) {
  for (const event of events) await processWhatsAppEvent(event);
}
