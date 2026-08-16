import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { conversationStateV2Schema, type ConversationStateV2 } from "./schema";
import type { ConversationQueueStoreV2, QueueJobV2 } from "./queue-contracts";

type Row = Record<string, unknown>;
const iso=(value:unknown)=>new Date(String(value)).toISOString();
const job = (row: Row): QueueJobV2 => ({
  id: String(row.id),
  organizationId: String(row.organization_id),
  conversationKey: String(row.conversation_key),
  externalMessageId: String(row.external_message_id),
  receivedAt: iso(row.received_at),
  createdAt: iso(row.created_at),
  payload: row.normalized_payload,
  status: String(row.queue_status) as QueueJobV2["status"],
  attempts: Number(row.attempts),
  availableAt: iso(row.available_at),
  processingStartedAt: row.processing_started_at
    ? iso(row.processing_started_at)
    : null,
  completedAt: row.processed_at ? iso(row.processed_at) : null,
  ownerToken: row.owner_token ? String(row.owner_token) : null,
  leaseExpiresAt: row.lease_expires_at ? iso(row.lease_expires_at) : null,
  errorCode: row.error_code ? String(row.error_code) : null,
  stateRevision:
    row.state_revision === null || row.state_revision === undefined
      ? null
      : Number(row.state_revision),
});
const required = <T>(
  data: T | null,
  error: { message?: string } | null,
  code: string,
) => {
  if (error || data === null) throw new Error(code);
  return data;
};

export class SupabaseConversationQueueStoreV2 implements ConversationQueueStoreV2 {
  constructor(private readonly admin: SupabaseClient) {}
  async enqueue(
    input: Omit<
      QueueJobV2,
      | "status"
      | "attempts"
      | "availableAt"
      | "processingStartedAt"
      | "completedAt"
      | "ownerToken"
      | "leaseExpiresAt"
      | "errorCode"
      | "stateRevision"
    >,
    graceMs: number,
  ) {
    const existing = await this.admin
      .from("channel_message_jobs")
      .select("id")
      .eq("channel", "whatsapp")
      .eq("external_message_id", input.externalMessageId)
      .maybeSingle();
    if (existing.data) {
      await this.admin
        .from("channel_message_jobs")
        .update({
          conversation_key: input.conversationKey,
          available_at: new Date(
            Date.parse(input.receivedAt) + graceMs,
          ).toISOString(),
        })
        .eq("id", existing.data.id);
      return "duplicate" as const;
    }
    const result = await this.admin
      .from("channel_message_jobs")
      .insert({
        id: input.id,
        organization_id: input.organizationId,
        channel: "whatsapp",
        external_message_id: input.externalMessageId,
        kind: "text",
        normalized_payload: input.payload,
        processing_status: "received",
        v2_eligible: true,
        v2_eligible_at: new Date().toISOString(),
        received_at: input.receivedAt,
        conversation_key: input.conversationKey,
        queue_status: "received",
        available_at: new Date(
          Date.parse(input.receivedAt) + graceMs,
        ).toISOString(),
      });
    if (result.error?.code === "23505") return "duplicate" as const;
    if (result.error) throw new Error("V2_JOB_ENQUEUE_FAILED");
    return "created" as const;
  }
  async acquireLease(
    conversationKey: string,
    ownerToken: string,
    now: string,
    leaseMs: number,
  ) {
    void now;
    const { data, error } = await this.admin.rpc("acquire_channel_lock_v2", {
      p_lock_key: conversationKey,
      p_organization_id: conversationKey.split(":", 1)[0],
      p_owner_token: ownerToken,
      p_lease_seconds: Math.ceil(leaseMs / 1000),
    });
    if (error) throw new Error("V2_LEASE_ACQUIRE_FAILED");
    return data === true;
  }
  async renewLease(
    conversationKey: string,
    ownerToken: string,
    now: string,
    leaseMs: number,
  ) {
    void now;
    const { data, error } = await this.admin.rpc("renew_channel_lock_v2", {
      p_lock_key: conversationKey,
      p_organization_id: conversationKey.split(":", 1)[0],
      p_owner_token: ownerToken,
      p_lease_seconds: Math.ceil(leaseMs / 1000),
    });
    if (error) throw new Error("V2_LEASE_RENEW_FAILED");
    return data === true;
  }
  async releaseLease(conversationKey: string, ownerToken: string) {
    const { data, error } = await this.admin.rpc("release_channel_lock_v2", {
      p_lock_key: conversationKey,
      p_organization_id: conversationKey.split(":", 1)[0],
      p_owner_token: ownerToken,
    });
    if (error) throw new Error("V2_LEASE_RELEASE_FAILED");
    return data === true;
  }
  async claimNext(conversationKey: string, ownerToken: string, now: string) {
    void now;
    const { data, error } = await this.admin.rpc("claim_channel_job_v2", {
      p_conversation_key: conversationKey,
      p_organization_id: conversationKey.split(":", 1)[0],
      p_owner_token: ownerToken,
    });
    if (error) throw new Error("V2_JOB_CLAIM_FAILED");
    const row = Array.isArray(data) ? data[0] : data;
    return row ? job(row as Row) : null;
  }
  async loadState(conversationKey: string) {
    const { data, error } = await this.admin
      .from("conversations")
      .select("conversation_state_v2")
      .eq("organization_id", conversationKey.split(":", 1)[0])
      .eq(
        "whatsapp_contact_id",
        conversationKey.slice(conversationKey.indexOf(":") + 1),
      )
      .single();
    return conversationStateV2Schema.parse(
      required(data, error, "V2_STATE_LOAD_FAILED").conversation_state_v2,
    );
  }
  async commitTransition(input: {
    conversationKey: string;
    ownerToken: string;
    jobId: string;
    expectedRevision: number;
    nextState: ConversationStateV2;
    now: string;
  }) {
    const current = await this.admin
      .from("channel_message_jobs")
      .select("conversation_id")
      .eq("id", input.jobId)
      .single();
    const conversationId = required(
      current.data,
      current.error,
      "V2_JOB_CONVERSATION_MISSING",
    ).conversation_id;
    if (!conversationId) throw new Error("V2_JOB_CONVERSATION_MISSING");
    const { data, error } = await this.admin.rpc(
      "commit_conversation_v2_transition",
      {
        p_conversation_id: conversationId,
        p_job_id: input.jobId,
        p_owner_token: input.ownerToken,
        p_expected_revision: input.expectedRevision,
        p_next_state: input.nextState,
      },
    );
    if (error) throw new Error("V2_CAS_RPC_FAILED");
    if (
      ![
        "committed",
        "cas_conflict",
        "lease_lost",
        "already_completed",
      ].includes(String(data))
    )
      throw new Error(`V2_CAS_${String(data).toUpperCase()}`);
    return data as
      "committed" | "cas_conflict" | "lease_lost" | "already_completed";
  }
  async defer(
    jobId: string,
    ownerToken: string,
    availableAt: string,
    errorCode: string,
  ) {
    const { error } = await this.admin.rpc("defer_channel_job_v2", {
      p_job_id: jobId,
      p_owner_token: ownerToken,
      p_available_at: availableAt,
      p_error_code: errorCode,
    });
    if (error) throw new Error("V2_JOB_DEFER_FAILED");
  }
  async fail(
    jobId: string,
    ownerToken: string,
    terminal: boolean,
    errorCode: string,
    now: string,
  ) {
    const { error } = await this.admin
      .from("channel_message_jobs")
      .update({
        queue_status: terminal ? "failed_terminal" : "failed_recoverable",
        available_at: now,
        error_code: errorCode.slice(0, 80),
        owner_token: null,
        lease_expires_at: null,
      })
      .eq("id", jobId)
      .eq("owner_token", ownerToken);
    if (error) throw new Error("V2_JOB_FAIL_FAILED");
  }
  async recover(now: string) {
    void now;
    const { data, error } = await this.admin.rpc("recover_channel_jobs_v2");
    if (error) throw new Error("V2_JOB_RECOVERY_FAILED");
    return Number(data);
  }
  async listConversationKeysWithWork(now: string) {
    const { data, error } = await this.admin
      .from("channel_message_jobs")
      .select("conversation_key")
      .in("queue_status", [
        "received",
        "ready",
        "deferred",
        "failed_recoverable",
      ])
      .eq("v2_eligible", true)
      .not("conversation_id", "is", null)
      .lte("available_at", now)
      .not("conversation_key", "is", null);
    if (error) throw new Error("V2_JOB_LIST_FAILED");
    return [
      ...new Set((data ?? []).map((row) => String(row.conversation_key))),
    ].sort();
  }
  async getJob(externalMessageId: string) {
    const { data, error } = await this.admin
      .from("channel_message_jobs")
      .select("*")
      .eq("channel", "whatsapp")
      .eq("external_message_id", externalMessageId)
      .maybeSingle();
    if (error) throw new Error("V2_JOB_GET_FAILED");
    return data ? job(data as Row) : undefined;
  }
}
