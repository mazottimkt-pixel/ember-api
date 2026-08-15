import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ activeBranding: vi.fn(), persistBranding: vi.fn(), findContact: vi.fn() }));
vi.mock("@/lib/branding/store", () => ({ activeBranding: mocks.activeBranding, persistBranding: mocks.persistBranding }));
vi.mock("@/lib/ai/tools", () => ({ findContact: mocks.findContact, createAgentDraft: vi.fn(), confirmAgentDocument: vi.fn(), queryDocuments: vi.fn() }));

import { emptyAgentDraft } from "@/lib/ai/contracts";
import { runAgentTurn } from "@/lib/ai/turn";
import { applyConversationExperience, FIRST_CONTACT_INTRODUCTION, RETURNING_USER_GREETING, TASK_RESUMPTION_GREETING } from "@/lib/conversation/experience";
import { createConversationPrompt, resolveActivePrompt } from "@/lib/navigation/conversation-prompts";

const ctx = { organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", supabase: {} as never };
type Scenario = { id: string; expectedBehavior: string; run: () => Promise<void> | void };

const commercial = Array.from({ length: 40 }, (_, index): Scenario => {
  const quantity = index + 1, unitPrice = index + 10, description = index % 2 ? "cadeiras" : "lâmpadas";
  return { id: `commercial-fragmented-${index + 1}`, expectedBehavior: "aproveitar item, prazo, pagamento e validade sem perguntar novamente dados conhecidos", run: async () => {
    let turn = await runAgentTurn(ctx, { action: "message", text: `${quantity} ${description} a R$ ${unitPrice} cada`, idempotencyKey: `item-${index}`, state: "collecting", draft: { ...emptyAgentDraft(), type: "quote", counterpartyName: "Cliente Alfa" }, collection: { pendingField: "itens" }, today: "2026-08-15" });
    expect(turn.draft.items[0]).toMatchObject({ description, quantity, unitPrice });
    turn = await runAgentTurn(ctx, { action: "message", text: "entrega em 10 dias", idempotencyKey: `deadline-${index}`, state: turn.state, draft: turn.draft, documentId: turn.documentId, collection: turn.collection, today: "2026-08-15" });
    expect(turn.draft.deadline).toBe("10 dias");
    turn = await runAgentTurn(ctx, { action: "message", text: "pix à vista", idempotencyKey: `payment-${index}`, state: turn.state, draft: turn.draft, documentId: turn.documentId, collection: turn.collection, today: "2026-08-15" });
    expect(turn.draft.paymentTerms).toBe("PIX à vista");
    turn = await runAgentTurn(ctx, { action: "message", text: "validade de 20 dias", idempotencyKey: `validity-${index}`, state: turn.state, draft: turn.draft, documentId: turn.documentId, collection: turn.collection, today: "2026-08-15" });
    expect(turn.draft.items[0]).toMatchObject({ quantity, unitPrice });
    expect(turn.draft).toMatchObject({ deadline: "10 dias", paymentTerms: "PIX à vista" });
    expect(turn.reply).not.toMatch(/qual (?:é )?(?:o )?(?:item|prazo|pagamento)/i);
  } };
});

const corrections = Array.from({ length: 30 }, (_, index): Scenario => {
  const initial = index + 10, corrected = initial + 5;
  return { id: `latest-correction-${index + 1}`, expectedBehavior: "a correção mais recente alterar somente a quantidade e preservar os demais campos", run: async () => {
    const draft = { ...emptyAgentDraft(), type: "quote" as const, counterpartyName: "Cliente Alfa", items: [{ description: "cadeiras", quantity: initial, unit: "un", unitPrice: 250, discount: 0 }], itemType: "product" as const, deadline: "10 dias", paymentTerms: "PIX à vista" };
    const turn = await runAgentTurn(ctx, { action: "message", text: `na verdade são ${corrected} cadeiras`, idempotencyKey: `correction-${index}`, state: "collecting", draft, collection: { pendingField: "correção" }, today: "2026-08-15" });
    expect(turn.draft.items[0]).toMatchObject({ description: "cadeiras", quantity: corrected, unitPrice: 250 });
    expect(turn.draft).toMatchObject({ counterpartyName: "Cliente Alfa", deadline: "10 dias", paymentTerms: "PIX à vista" });
  } };
});

const naturalConfirmations = Array.from({ length: 15 }, (_, index): Scenario => {
  const phrase = ["sim", "pode emitir", "pode fazer", "está correto", "manda o pdf"][index % 5];
  return { id: `button-natural-language-${index + 1}`, expectedBehavior: "uma resposta textual equivalente resolver o prompt interativo sem exigir clique ou número", run: () => {
    const prompt = createConversationPrompt({ promptType: "confirmation", flowId: `quote-${index}`, expectedState: "awaiting_confirmation", options: [{ number: 1, id: "confirm_document", label: "Emitir documento" }, { number: 2, id: "correct_document", label: "Corrigir" }, { number: 3, id: "cancel_document", label: "Cancelar" }] });
    expect(resolveActivePrompt(phrase, prompt, "awaiting_confirmation")?.id).toBe("confirm_document");
  } };
});

const introductions = Array.from({ length: 15 }, (_, index): Scenario => ({ id: `contact-memory-${index + 1}`, expectedBehavior: "a apresentação completa ocorrer uma vez e saudações posteriores respeitarem tarefa ativa", run: () => {
  const first = applyConversationExperience({ message: "oi", state: "menu", draft: emptyAgentDraft(), collection: {}, reply: "resposta antiga", now: new Date(`2026-08-15T12:00:${String(index).padStart(2, "0")}Z`) });
  expect(first.reply).toContain(FIRST_CONTACT_INTRODUCTION);
  const returning = applyConversationExperience({ message: "bom dia", state: "menu", draft: emptyAgentDraft(), collection: first.collection, reply: "resposta antiga", now: new Date(`2026-08-16T12:00:${String(index).padStart(2, "0")}Z`) });
  expect(returning.reply).toBe(RETURNING_USER_GREETING); expect(returning.reply).not.toContain(FIRST_CONTACT_INTRODUCTION);
  const resuming = applyConversationExperience({ message: "oi", state: "collecting", draft: { ...emptyAgentDraft(), type: "quote" }, collection: returning.collection, reply: "resposta antiga" });
  expect(resuming.reply).toBe(TASK_RESUMPTION_GREETING);
} }));

const scenarios: Scenario[] = [...commercial, ...corrections, ...naturalConfirmations, ...introductions];

describe("conversational quality gate — 100 cenários multi-turn", () => {
  beforeEach(() => { mocks.findContact.mockReset(); mocks.findContact.mockResolvedValue([{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", legal_name: "Cliente Alfa", tax_id: null }]); });
  it("possui exatamente cem cenários com comportamento esperado explícito", () => { expect(scenarios).toHaveLength(100); expect(scenarios.every((scenario) => scenario.expectedBehavior.length > 20)).toBe(true); });
  it.each(scenarios)("$id — $expectedBehavior", async ({ run }) => { await run(); });
});
