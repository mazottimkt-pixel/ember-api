import "server-only";
import type {
  ConversationQueueStoreV2,
  QueueTransitionV2,
} from "./queue-contracts";
import { ConversationQueueEngineV2 } from "./queue-engine";
import { SupabaseConversationQueueStoreV2 } from "./supabase-queue-store";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { transitionQueuedInboundV2 } from "./inbound-transition";
export const CONVERSATION_V2_RECOVERY_INTERVAL_MS = 15_000,
  CONVERSATION_V2_RECOVERY_KEY_BATCH = 5;
export async function runConversationV2RecoveryTick(
  store: ConversationQueueStoreV2,
  transition: QueueTransitionV2 = transitionQueuedInboundV2,
) {
  const started = Date.now(),
    recovered = await store.recover(new Date().toISOString()),
    keys = (
      await store.listConversationKeysWithWork(new Date().toISOString())
    ).slice(0, CONVERSATION_V2_RECOVERY_KEY_BATCH),
    engine = new ConversationQueueEngineV2(store, { graceMs: 250 }),
    results = await Promise.all(
      keys.map((key) => engine.drainConversation(key, transition)),
    ),
    processed = results.reduce(
      (sum, result) =>
        sum + (result.status === "drained" ? result.processed : 0),
      0,
    );
  console.info("conversation.v2.recovery", {
    recovered,
    conversationCount: keys.length,
    processed,
    durationMs: Date.now() - started,
  });
  return { recovered, processed, conversationCount: keys.length };
}
declare global {
  var __lumeConversationV2Recovery: ReturnType<typeof setInterval> | undefined;
  var __lumeConversationV2RecoveryBusy: boolean | undefined;
}
export function startConversationV2RecoveryRunner() {
  if (globalThis.__lumeConversationV2Recovery) return false;
  const tick = async () => {
    if (globalThis.__lumeConversationV2RecoveryBusy) return;
    globalThis.__lumeConversationV2RecoveryBusy = true;
    await runConversationV2RecoveryTick(
      new SupabaseConversationQueueStoreV2(createSupabaseAdminClient()),
    ).catch((error) =>
      console.warn("conversation.v2.recovery.failed", {
        code: error instanceof Error ? error.message : "UNKNOWN",
      }),
    );
    globalThis.__lumeConversationV2RecoveryBusy = false;
  };
  void tick();
  globalThis.__lumeConversationV2Recovery = setInterval(
    tick,
    CONVERSATION_V2_RECOVERY_INTERVAL_MS,
  );
  globalThis.__lumeConversationV2Recovery.unref?.();
  return true;
}
export function stopConversationV2RecoveryRunner() {
  if (!globalThis.__lumeConversationV2Recovery) return false;
  clearInterval(globalThis.__lumeConversationV2Recovery);
  globalThis.__lumeConversationV2Recovery = undefined;
  globalThis.__lumeConversationV2RecoveryBusy = false;
  return true;
}
