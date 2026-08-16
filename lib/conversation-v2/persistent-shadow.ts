import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { conversationEventV2Schema, statePatchV2Schema } from "./contracts";
import { interpretInboundV2 } from "./interpreter";
import { mapLegacyConversationToV2 } from "./legacy-mapper";
import { reduceConversationV2 } from "./reducer";
import { conversationStateV2Schema } from "./schema";

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
  const key = `${input.organizationId}:${input.conversationKey}`,
    owner = randomUUID();
  await input.admin
    .from("channel_message_jobs")
    .update({
      conversation_id: input.conversationId,
      conversation_key: key,
      queue_status: "received",
      available_at: new Date(Date.parse(input.receivedAt) + 250).toISOString(),
    })
    .eq("organization_id", input.organizationId)
    .eq("channel", "whatsapp")
    .eq("external_message_id", input.externalMessageId)
    .neq("queue_status", "completed");
  const lease = await input.admin.rpc("acquire_channel_lock_v2", {
    p_lock_key: key,
    p_organization_id: input.organizationId,
    p_owner_token: owner,
    p_lease_seconds: 60,
  });
  if (lease.error || lease.data !== true)
    return { status: "deferred" as const };
  try {
    let stored = await input.admin
      .from("conversations")
      .select("conversation_state_v2,conversation_revision_v2")
      .eq("id", input.conversationId)
      .eq("organization_id", input.organizationId)
      .single();
    if (stored.error) throw new Error("V2_SHADOW_STATE_LOAD_FAILED");
    if (!stored.data.conversation_state_v2) {
      const mapped = mapLegacyConversationToV2({
        organizationId: input.organizationId,
        conversationKey: input.conversationKey,
        state: input.legacyState,
        context: input.legacyContext,
        now: input.receivedAt,
      });
      if (!mapped.state) return { status: "mapping_failed" as const };
      await input.admin
        .from("conversations")
        .update({
          conversation_state_v2: mapped.state,
          conversation_revision_v2: mapped.state.revision,
        })
        .eq("id", input.conversationId)
        .eq("organization_id", input.organizationId)
        .is("conversation_state_v2", null);
      stored = await input.admin
        .from("conversations")
        .select("conversation_state_v2,conversation_revision_v2")
        .eq("id", input.conversationId)
        .single();
    }
    const claimed = await input.admin.rpc("claim_channel_job_v2", {
      p_conversation_key: key,
      p_organization_id: input.organizationId,
      p_owner_token: owner,
    });
    if (claimed.error) throw new Error("V2_SHADOW_CLAIM_FAILED");
    const job = Array.isArray(claimed.data) ? claimed.data[0] : claimed.data;
    if (!job) return { status: "not_ready" as const };
    if (!stored.data) throw new Error("V2_SHADOW_STATE_INIT_FAILED");
    const state = conversationStateV2Schema.parse(
      stored.data.conversation_state_v2,
    );
    if (state.lastProcessedEvent?.externalMessageId === input.externalMessageId)
      return { status: "duplicate" as const };
    const understood = interpretInboundV2(state, input.text),
      event = conversationEventV2Schema.parse({
        type: "INBOUND_TEXT",
        occurredAt: input.receivedAt,
        receivedAt: input.receivedAt,
        externalMessageId: input.externalMessageId,
      }),
      transition = reduceConversationV2(
        state,
        event,
        understood.interpretation,
        understood.patch ??
          statePatchV2Schema.parse({
            baseRevision: state.revision,
            operations: [],
          }),
      );
    const committed = await input.admin.rpc(
      "commit_conversation_v2_transition",
      {
        p_conversation_id: input.conversationId,
        p_job_id: job.id,
        p_owner_token: owner,
        p_expected_revision: state.revision,
        p_next_state: transition.nextState,
      },
    );
    if (committed.error) throw new Error("V2_SHADOW_COMMIT_FAILED");
    console.info("conversation.v2.persistence", {
      jobId: String(job.id),
      conversationHash: key.slice(-12),
      revisionBefore: state.revision,
      revisionAfter: transition.nextState.revision,
      ownerMasked: `${owner.slice(0, 4)}…`,
      casConflict: committed.data === "cas_conflict",
      finalStatus: String(committed.data),
    });
    return { status: String(committed.data) };
  } finally {
    await input.admin.rpc("release_channel_lock_v2", {
      p_lock_key: key,
      p_organization_id: input.organizationId,
      p_owner_token: owner,
    });
  }
}
