import type { ChannelProcessingStatus, NormalizedInbound, NormalizedOutbound } from "./contracts";

export interface ChannelQueueRepository {
  claim(message: NormalizedInbound): Promise<"claimed" | "duplicate">;
  acquireConversationLock(key: string, leaseMs: number): Promise<boolean>;
  releaseConversationLock(key: string): Promise<void>;
  updateStatus(externalMessageId: string, status: ChannelProcessingStatus, errorCode?: string): Promise<void>;
  enqueueOutbound(output: NormalizedOutbound): Promise<void>;
  requestHumanHandoff(message: NormalizedInbound, reason: string): Promise<void>;
}

export async function withBackoff<T>(operation: () => Promise<T>, options = { attempts: 3, baseDelayMs: 250 }) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      lastError = error;
      if (attempt === options.attempts) break;
      await new Promise((resolve) => setTimeout(resolve, options.baseDelayMs * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

export class ChannelMessageProcessor {
  constructor(private readonly repository: ChannelQueueRepository) {}

  async process(message: NormalizedInbound, handler: (message: NormalizedInbound) => Promise<NormalizedOutbound>) {
    if (await this.repository.claim(message) === "duplicate") return { duplicate: true as const };
    const lockKey = `${message.organizationId}:${message.externalConversationId ?? message.externalMessageId}`;
    if (!(await this.repository.acquireConversationLock(lockKey, 30_000))) return { deferred: true as const };
    try {
      await this.repository.updateStatus(message.externalMessageId, "processing");
      const output = await handler(message);
      await withBackoff(() => this.repository.enqueueOutbound(output));
      await this.repository.updateStatus(message.externalMessageId, "responded");
      return { output };
    } catch (error) {
      const code = error instanceof Error ? error.name : "UNKNOWN";
      await this.repository.updateStatus(message.externalMessageId, "failed", code);
      await this.repository.requestHumanHandoff(message, code);
      throw error;
    } finally {
      await this.repository.releaseConversationLock(lockKey);
    }
  }
}
