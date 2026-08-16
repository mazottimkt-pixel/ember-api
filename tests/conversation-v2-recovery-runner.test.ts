import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createConversationStateV2 } from "@/lib/conversation-v2/schema";
import { MemoryConversationQueueStoreV2 } from "@/lib/conversation-v2/memory-queue-store";
import {
  ConversationQueueEngineV2,
  nextCursorState,
} from "@/lib/conversation-v2/queue-engine";
import {
  runConversationV2RecoveryTick,
  CONVERSATION_V2_RECOVERY_INTERVAL_MS,
} from "@/lib/conversation-v2/recovery-runner";
const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function fixture() {
  const now = new Date(Date.now() - 10_000).toISOString(),
    state = createConversationStateV2({
      organizationId: org,
      conversationKey: "wa:runner",
      now,
    }),
    store = new MemoryConversationQueueStoreV2([state]),
    engine = new ConversationQueueEngineV2(store, { graceMs: 0 });
  return { now, store, engine };
}
const transition = (
  state: ReturnType<typeof createConversationStateV2>,
  job: Parameters<typeof nextCursorState>[1],
) => nextCursorState(state, job, new Date().toISOString());
describe("Conversation V2 autonomous recovery runner", () => {
  it("uses a balanced 15 second interval", () =>
    expect(CONVERSATION_V2_RECOVERY_INTERVAL_MS).toBe(15_000));
  it("completes deferred work without a new inbound", async () => {
    const { now, store, engine } = fixture();
    await engine.enqueue({
      id: "11111111-1111-4111-8111-111111111111",
      organizationId: org,
      conversationKey: "wa:runner",
      externalMessageId: "wamid.deferred",
      receivedAt: now,
      payload: { text: "olá" },
    });
    const job = [...store.jobs.values()][0];
    store.jobs.set(job.id, { ...job, status: "deferred", availableAt: now });
    const result = await runConversationV2RecoveryTick(store, transition);
    expect(result.processed).toBe(1);
    expect((await store.getJob("wamid.deferred"))?.status).toBe("completed");
  });
  it("recovers expired processing without inbound", async () => {
    const { now, store, engine } = fixture();
    await engine.enqueue({
      id: "22222222-2222-4222-8222-222222222222",
      organizationId: org,
      conversationKey: "wa:runner",
      externalMessageId: "wamid.stale",
      receivedAt: now,
      payload: { text: "olá" },
    });
    const job = [...store.jobs.values()][0];
    store.jobs.set(job.id, {
      ...job,
      status: "processing",
      ownerToken: "dead",
      leaseExpiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    const result = await runConversationV2RecoveryTick(store, transition);
    expect(result.recovered).toBe(1);
    expect((await store.getJob("wamid.stale"))?.status).toBe("completed");
  });
  it("remains safe across restart and two concurrent runners", async () => {
    const { now, store, engine } = fixture(),
      seen: string[] = [];
    await engine.enqueue({
      id: "33333333-3333-4333-8333-333333333333",
      organizationId: org,
      conversationKey: "wa:runner",
      externalMessageId: "wamid.restart",
      receivedAt: now,
      payload: { text: "olá" },
    });
    const apply = (
      state: ReturnType<typeof createConversationStateV2>,
      job: Parameters<typeof nextCursorState>[1],
    ) => {
      seen.push(job.externalMessageId);
      return nextCursorState(state, job, new Date().toISOString());
    };
    await Promise.all([
      runConversationV2RecoveryTick(store, apply),
      runConversationV2RecoveryTick(store, apply),
    ]);
    const restarted = new ConversationQueueEngineV2(store);
    await restarted.recover();
    expect(seen).toEqual(["wamid.restart"]);
    expect((await store.getJob("wamid.restart"))?.status).toBe("completed");
  });
});
