import { describe, expect, it, vi } from "vitest";
import { ChannelMessageProcessor, withBackoff, type ChannelQueueRepository } from "@/lib/channels/queue";
import type { NormalizedInbound, NormalizedOutbound } from "@/lib/channels/contracts";

const message: NormalizedInbound = { channel: "agent-lab", externalMessageId: "msg-1", externalConversationId: "conv-1", organizationId: "018f7787-0d65-7f68-8176-74f8db53d505", kind: "text", text: "Olá", receivedAt: new Date().toISOString(), metadata: {} };
const output: NormalizedOutbound = { channel: "agent-lab", conversationId: "conv-1", kind: "text", text: "Olá", metadata: {} };

function repository(overrides: Partial<ChannelQueueRepository> = {}): ChannelQueueRepository {
  return { claim: vi.fn().mockResolvedValue("claimed"), acquireConversationLock: vi.fn().mockResolvedValue(true), releaseConversationLock: vi.fn(), updateStatus: vi.fn(), enqueueOutbound: vi.fn(), requestHumanHandoff: vi.fn(), ...overrides };
}

describe("channel queue", () => {
  it("deduplica antes de processar", async () => {
    const repo = repository({ claim: vi.fn().mockResolvedValue("duplicate") });
    const handler = vi.fn();
    expect(await new ChannelMessageProcessor(repo).process(message, handler)).toEqual({ duplicate: true });
    expect(handler).not.toHaveBeenCalled();
  });

  it("serializa por conversa e registra estados", async () => {
    const repo = repository();
    const result = await new ChannelMessageProcessor(repo).process(message, async () => output);
    expect(result).toEqual({ output });
    expect(repo.updateStatus).toHaveBeenNthCalledWith(1, "msg-1", "processing");
    expect(repo.updateStatus).toHaveBeenNthCalledWith(2, "msg-1", "responded");
    expect(repo.releaseConversationLock).toHaveBeenCalled();
  });

  it("encaminha para atendimento humano após falha", async () => {
    const repo = repository();
    await expect(new ChannelMessageProcessor(repo).process(message, async () => { throw new Error("falha"); })).rejects.toThrow("falha");
    expect(repo.updateStatus).toHaveBeenCalledWith("msg-1", "failed", "Error");
    expect(repo.requestHumanHandoff).toHaveBeenCalled();
  });

  it("limita retry com backoff", async () => {
    const operation = vi.fn().mockRejectedValueOnce(new Error("transient")).mockResolvedValue("ok");
    await expect(withBackoff(operation, { attempts: 2, baseDelayMs: 1 })).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
