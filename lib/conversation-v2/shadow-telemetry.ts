import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export const SHADOW_OUTCOMES = ["PROCESSED", "REJECTED_WITH_REASON", "DEFERRED", "RECOVERABLE_FAILURE", "TERMINAL_FAILURE"] as const;
export type ShadowOutcome = typeof SHADOW_OUTCOMES[number];

export type ShadowCorrelation = {
  organizationId: string;
  externalMessageId: string;
  conversationId: string;
};

const safeCode = (value: string) => value.replace(/[^A-Z0-9_:-]/gi, "_").slice(0, 120);

export async function recordShadowAttempt(admin: SupabaseClient, correlation: ShadowCorrelation) {
  const now = new Date().toISOString();
  const { error } = await admin.from("channel_message_jobs").update({
    v2_shadow_attempted_at: now,
    v2_shadow_outcome: "DEFERRED",
    v2_shadow_outcome_code: "V2_SHADOW_ATTEMPT_STARTED",
    v2_shadow_outcome_at: now,
  }).eq("organization_id", correlation.organizationId).eq("channel", "whatsapp").eq("external_message_id", correlation.externalMessageId);
  if (error) throw new Error("V2_SHADOW_ATTEMPT_TELEMETRY_FAILED");
}

export async function recordShadowOutcome(admin: SupabaseClient, correlation: ShadowCorrelation, outcome: ShadowOutcome, code: string, evidence?: Record<string, unknown>) {
  const { error } = await admin.from("channel_message_jobs").update({
    conversation_id: correlation.conversationId,
    v2_shadow_outcome: outcome,
    v2_shadow_outcome_code: safeCode(code),
    v2_shadow_outcome_at: new Date().toISOString(),
    ...(evidence ? { v2_shadow_evidence: evidence } : {}),
  }).eq("organization_id", correlation.organizationId).eq("channel", "whatsapp").eq("external_message_id", correlation.externalMessageId).not("v2_shadow_attempted_at", "is", null);
  if (error) throw new Error("V2_SHADOW_OUTCOME_TELEMETRY_FAILED");
}

export function shadowOutcomeForError(error: unknown): { outcome: ShadowOutcome; code: string } {
  const code = error instanceof Error ? error.message : "UNKNOWN";
  if (/SCHEMA|INVALID|UNSUPPORTED|MAPPING|BOOTSTRAP|STATE_LOAD/.test(code)) return { outcome: "RECOVERABLE_FAILURE", code };
  return { outcome: "TERMINAL_FAILURE", code };
}
