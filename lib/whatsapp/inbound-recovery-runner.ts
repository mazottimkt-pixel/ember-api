import "server-only";
import { normalizedInboundSchema, type NormalizedInbound } from "@/lib/channels/contracts";
import type { ParsedWhatsAppEvent } from "@/lib/channels/whatsapp-adapter";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { processWhatsAppEvent } from "./processor";

export const LEGACY_INBOUND_RECOVERY_INTERVAL_MS = 15_000;

export function parsedEventFromNormalized(message: NormalizedInbound): ParsedWhatsAppEvent {
  const phoneNumberId = message.metadata.phoneNumberId;
  if (typeof phoneNumberId !== "string" || !phoneNumberId)
    throw new Error("LEGACY_RECOVERY_PHONE_NUMBER_MISSING");
  return {
    phoneNumberId,
    externalMessageId: message.externalMessageId,
    externalConversationId: message.externalConversationId ?? "",
    kind: message.kind,
    text: message.text,
    mediaReference: message.mediaReference,
    buttonId: message.buttonId,
    receivedAt: message.receivedAt,
    status:
      typeof message.metadata.status === "string"
        ? (message.metadata.status as ParsedWhatsAppEvent["status"])
        : undefined,
    recipientId:
      typeof message.metadata.recipientId === "string"
        ? message.metadata.recipientId
        : undefined,
    metadata: message.metadata,
  };
}

export async function runLegacyInboundRecoveryTick() {
  const admin = createSupabaseAdminClient();
  const recovered = await admin.rpc("recover_channel_jobs_legacy");
  if (recovered.error) throw new Error("LEGACY_QUEUE_RECOVERY_FAILED");
  const work = await admin
    .from("channel_message_jobs")
    .select("id,normalized_payload")
    .in("legacy_queue_status", ["received", "deferred", "failed_recoverable"])
    .lte("legacy_available_at", new Date().toISOString())
    .order("received_at")
    .order("created_at")
    .limit(20);
  if (work.error) throw new Error("LEGACY_QUEUE_LIST_FAILED");
  let processed = 0;
  for (const row of work.data ?? []) {
    const parsed = normalizedInboundSchema.safeParse(row.normalized_payload);
    if (!parsed.success || parsed.data.kind === "status") continue;
    const result = await processWhatsAppEvent(parsedEventFromNormalized(parsed.data), {
      existingJobId: String(row.id),
    });
    if ("processed" in result && result.processed) processed += 1;
  }
  console.info("whatsapp.inbound.recovery", {
    recovered: Number(recovered.data),
    eligible: work.data?.length ?? 0,
    processed,
  });
  return { recovered: Number(recovered.data), eligible: work.data?.length ?? 0, processed };
}

declare global {
  var __lumeLegacyInboundRecovery: ReturnType<typeof setInterval> | undefined;
  var __lumeLegacyInboundRecoveryBusy: boolean | undefined;
}

export function startLegacyInboundRecoveryRunner() {
  if (globalThis.__lumeLegacyInboundRecovery) return false;
  const tick = async () => {
    if (globalThis.__lumeLegacyInboundRecoveryBusy) return;
    globalThis.__lumeLegacyInboundRecoveryBusy = true;
    await runLegacyInboundRecoveryTick().catch((error) =>
      console.warn("whatsapp.inbound.recovery.failed", {
        code: error instanceof Error ? error.message : "UNKNOWN",
      }),
    );
    globalThis.__lumeLegacyInboundRecoveryBusy = false;
  };
  void tick();
  globalThis.__lumeLegacyInboundRecovery = setInterval(
    tick,
    LEGACY_INBOUND_RECOVERY_INTERVAL_MS,
  );
  globalThis.__lumeLegacyInboundRecovery.unref?.();
  return true;
}
