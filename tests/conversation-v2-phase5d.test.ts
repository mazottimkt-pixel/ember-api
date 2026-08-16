import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { emptyAgentDraft } from "@/lib/ai/contracts";
import { parsedEventFromNormalized } from "@/lib/whatsapp/inbound-recovery-runner";
import { transitionQueuedInboundV2 } from "@/lib/conversation-v2/inbound-transition";
import { mapLegacyConversationToV2, normalizeLegacyExpectedInput } from "@/lib/conversation-v2/legacy-mapper";
import { classifyShadowWithOracle } from "@/lib/conversation-v2/oracle";
import { createConversationStateV2 } from "@/lib/conversation-v2/schema";
import type { QueueJobV2 } from "@/lib/conversation-v2/queue-contracts";
import { readFileSync } from "node:fs";

const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const at = (second: number) => `2026-08-16T12:00:${String(second).padStart(2, "0")}.000Z`;
const job = (text: string, second: number): QueueJobV2 => ({
  id: crypto.randomUUID(), organizationId: org, conversationKey: `${org}:wa:test`, externalMessageId: `wamid.${second}`,
  receivedAt: at(second), createdAt: at(second), payload: { text }, status: "processing", attempts: 1,
  availableAt: at(second), processingStartedAt: at(second), completedAt: null, ownerToken: crypto.randomUUID(),
  leaseExpiresAt: at(second + 30), errorCode: null, stateRevision: null,
});

describe("Conversation V2 Phase 5D gate", () => {
  it("bootstraps at zero and advances every material turn 0→1→2→3", () => {
    const zero = createConversationStateV2({ organizationId: org, conversationKey: `${org}:wa:test`, now: at(0) });
    const one = transitionQueuedInboundV2(zero, job("Quero fazer um orçamento", 1));
    const two = transitionQueuedInboundV2(one, job("Empresa Alfa", 2));
    const three = transitionQueuedInboundV2(two, job("20 cadeiras a R$ 30 cada", 3));
    expect([zero.revision, one.revision, two.revision, three.revision]).toEqual([0, 1, 2, 3]);
    expect(three.lastProcessedEvent?.stateRevision).toBe(3);
  });

  it("normalizes the real legacy expectedInput leak without widening the V2 enum", () => {
    expect(normalizeLegacyExpectedInput("price_scope")).toBe("item_bundle");
    expect(normalizeLegacyExpectedInput("document_selection")).toBe("free_text");
    const mapped = mapLegacyConversationToV2({
      organizationId: org, conversationKey: `${org}:wa:test`, state: "collecting", now: at(0),
      context: { draft: { ...emptyAgentDraft(), type: "quote", counterpartyName: "Empresa Anônima" }, collection: { expectedAnswer: "price_scope" } },
    });
    expect(mapped.state?.interaction?.expectedInput).toBe("item_bundle");
  });

  it("emits deterministic oracle categories without an LLM judge", () => {
    const agreed = classifyShadowWithOracle({
      legacy: { intent: "quote", stateBefore: "collecting", stateAfter: "collecting", nextAction: "itens" },
      v2: { intent: "quote", stateBefore: "collecting", stateAfter: "collecting", nextAction: "ASK_ITEM_BUNDLE", interaction: "item_bundle" },
      mappingFailed: false,
    });
    expect(agreed.category).toBe("BOTH_CORRECT");
    expect(agreed.expectedBehaviorSource).toBe("STRUCTURAL_VALIDATION");
    const catalog = classifyShadowWithOracle({
      legacy: { intent: "quote", stateBefore: "menu", stateAfter: "collecting", nextAction: "cliente" },
      v2: { intent: "quote", stateBefore: "idle", stateAfter: "collecting", nextAction: "ASK_COUNTERPARTY", interaction: "counterparty" },
      mappingFailed: false,
      catalogExpected: { intent: "quote", nextAction: "ASK_COUNTERPARTY" },
    });
    expect(catalog.category).toBe("V2_CORRECT_LEGACY_WRONG");
    expect(catalog.expectedBehaviorSource).toBe("CATALOG_TRANSCRIPT");
  });

  it("reconstructs a durable inbound for legacy recovery", () => {
    const event = parsedEventFromNormalized({ channel: "whatsapp", organizationId: org, externalMessageId: "wamid.recover", externalConversationId: "5511999999999", kind: "text", text: "pretas", receivedAt: at(4), metadata: { phoneNumberId: "123" } });
    expect(event).toMatchObject({ phoneNumberId: "123", externalMessageId: "wamid.recover", text: "pretas" });
  });

  it("uses one shared job and explicit eligibility for both stages", () => {
    const sql = readFileSync("supabase/migrations/202608160001_conversation_v2_phase5d.sql", "utf8");
    expect(sql).toContain("legacy_queue_status");
    expect(sql).toContain("v2_eligible=true");
    expect(sql).toContain("claim_channel_job_legacy");
    expect(sql).not.toMatch(/create table .*queue/i);
  });
});
