import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mapLegacyConversationToV2 } from "./legacy-mapper";
import { ConversationQueueEngineV2 } from "./queue-engine";
import { SupabaseConversationQueueStoreV2 } from "./supabase-queue-store";
import { transitionQueuedInboundV2 } from "./inbound-transition";

export async function persistConversationV2ShadowTurn(input: {
  admin: SupabaseClient;
  organizationId: string;
  conversationId: string;
  conversationKey: string;
  externalMessageId: string;
  receivedAt: string;
  text: string;
  legacyState: string;
  legacyContext: unknown;
}) {
  const key = `${input.organizationId}:${input.conversationKey}`;
  const eligible = await input.admin
    .from("channel_message_jobs")
    .update({
      conversation_id: input.conversationId,
      conversation_key: key,
      queue_status: "received",
      available_at: input.receivedAt,
      v2_eligible: true,
      v2_eligible_at: new Date().toISOString(),
    })
    .eq("organization_id", input.organizationId)
    .eq("channel", "whatsapp")
    .eq("external_message_id", input.externalMessageId)
    .neq("queue_status", "completed");
  if (eligible.error) throw new Error("V2_SHADOW_ELIGIBILITY_FAILED");

  const stored = await input.admin
    .from("conversations")
    .select("conversation_state_v2")
    .eq("id", input.conversationId)
    .eq("organization_id", input.organizationId)
    .single();
  if (stored.error) throw new Error("V2_SHADOW_STATE_LOAD_FAILED");
  if (!stored.data.conversation_state_v2) {
    const mapped = mapLegacyConversationToV2({
      organizationId: input.organizationId,
      conversationKey: key,
      state: input.legacyState,
      context: input.legacyContext,
      now: input.receivedAt,
    });
    if (!mapped.state) return { status: "mapping_failed" as const };
    const bootstrap = await input.admin
      .from("conversations")
      .update({
        conversation_state_v2: mapped.state,
        conversation_revision_v2: 0,
      })
      .eq("id", input.conversationId)
      .eq("organization_id", input.organizationId)
      .is("conversation_state_v2", null);
    if (bootstrap.error) throw new Error("V2_SHADOW_BOOTSTRAP_FAILED");
  }

  const engine = new ConversationQueueEngineV2(
    new SupabaseConversationQueueStoreV2(input.admin),
    { graceMs: 0 },
  );
  return engine.drainConversation(key, transitionQueuedInboundV2);
}
