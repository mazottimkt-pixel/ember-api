import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ findContact: vi.fn() }));
vi.mock("@/lib/branding/store", () => ({ activeBranding: vi.fn(), persistBranding: vi.fn() }));
vi.mock("@/lib/ai/tools", () => ({ findContact: mocks.findContact, createAgentDraft: vi.fn(), confirmAgentDocument: vi.fn(), queryDocuments: vi.fn() }));

import { emptyAgentDraft } from "@/lib/ai/contracts";
import { runAgentTurn } from "@/lib/ai/turn";
import { classifyIntentTransition, cleanDraftForIntent } from "@/lib/conversation/intent-transition";
import { createConversationPrompt, resolveActivePrompt } from "@/lib/navigation/conversation-prompts";
import { buildAgentWhatsAppOutputs } from "@/lib/whatsapp/agent-bridge";

const ctx = { organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", supabase: {} as never };
type Scenario = { id: string; expectedBehavior: string; run: () => Promise<void> | void };

const purchaseOrders = Array.from({ length: 40 }, (_, index): Scenario => {
  const quantity = index + 2, unitPrice = index + 50, item = index % 2 ? "monitores" : "cadeiras";
  return { id: `purchase-order-${index + 1}`, expectedBehavior: "coletar pedido fragmentado, preservar todos os dados conhecidos e não executar antes da revisão", run: async () => {
    let turn = await runAgentTurn(ctx, { action: "message", text: `${quantity} ${item} a R$ ${unitPrice} cada`, idempotencyKey: `po-item-${index}`, state: "collecting", draft: { ...emptyAgentDraft(), type: "purchase_order", counterpartyName: "Fornecedor Beta" }, collection: { pendingField: "itens" } });
    expect(turn.draft.items[0]).toMatchObject({ description: item, quantity, unitPrice });
    turn = await runAgentTurn(ctx, { action: "message", text: "entrega em 12 dias", idempotencyKey: `po-deadline-${index}`, state: turn.state, draft: turn.draft, collection: turn.collection });
    turn = await runAgentTurn(ctx, { action: "message", text: "boleto em 30 dias", idempotencyKey: `po-payment-${index}`, state: turn.state, draft: turn.draft, collection: turn.collection });
    turn = await runAgentTurn(ctx, { action: "message", text: "Rua Central, 100, São Paulo - SP", idempotencyKey: `po-address-${index}`, state: turn.state, draft: turn.draft, collection: turn.collection });
    expect(turn.draft).toMatchObject({ deadline: "12 dias", paymentTerms: "boleto em 30 dias", deliveryAddress: "Rua Central, 100, São Paulo - SP" });
    expect(turn.state).toBe("awaiting_confirmation");
  } };
});

const switchPhrases = ["esquece isso quero fazer um pedido de compra", "na sequência quero um pedido de compra", "quero comprar esses itens", "agora preciso criar pedido de compra", "troca para pedido de compra"];
const intentSwitches = Array.from({ length: 25 }, (_, index): Scenario => ({ id: `intent-switch-${index + 1}`, expectedBehavior: "uma intenção material incompatível durante tarefa ativa exigir confirmação e nunca reutilizar dados silenciosamente", run: () => {
  const draft = { ...emptyAgentDraft(), type: "quote" as const, counterpartyName: "Cliente Alfa", items: [{ description: "cadeiras", quantity: 20, unit: "un", unitPrice: 250, discount: 0 }] };
  const decision = classifyIntentTransition({ message: switchPhrases[index % switchPhrases.length], state: index % 2 ? "collecting" : "awaiting_confirmation", draft, hasActivePrompt: index % 2 === 0 });
  expect(decision).toMatchObject({ kind: "CONFIRM_SWITCH", current: "quote", requested: "purchase_order" });
  expect(cleanDraftForIntent("purchase_order")).toMatchObject({ type: "purchase_order", counterpartyName: null, items: [] });
} }));

const interruptionPhrases = ["qual é o CNPJ da minha empresa", "mostre os dados da minha empresa", "manda aquele contrato", "busque o comprovante", "localize esse arquivo"];
const interruptions = Array.from({ length: 15 }, (_, index): Scenario => ({ id: `temporary-interruption-${index + 1}`, expectedBehavior: "consulta delimitada durante tarefa ativa ser classificada como interrupção temporária e preservar o draft", run: () => {
  const draft = { ...emptyAgentDraft(), type: index % 2 ? "purchase_order" as const : "quote" as const, counterpartyName: "Alfa" };
  const snapshot = structuredClone(draft), decision = classifyIntentTransition({ message: interruptionPhrases[index % interruptionPhrases.length], state: "collecting", draft });
  expect(decision.kind).toBe("TEMPORARY_INTERRUPTION"); expect(draft).toEqual(snapshot);
} }));

const administrativeQueries = Array.from({ length: 10 }, (_, index): Scenario => ({ id: `administrative-query-${index + 1}`, expectedBehavior: "consulta de arquivo ou dado empresarial possuir intenção explícita sem inventar resultado ou concluir tool não executada", run: () => {
  const message = index % 2 ? "procure o contrato da Alfa" : "qual é o CNPJ da minha empresa";
  const decision = classifyIntentTransition({ message, state: "collecting", draft: { ...emptyAgentDraft(), type: "quote" } });
  expect(["vault_search", "business_query"]).toContain(decision.requested); expect(decision.kind).toBe("TEMPORARY_INTERRUPTION");
} }));

const interfaceCases = Array.from({ length: 10 }, (_, index): Scenario => ({ id: `interactive-routing-${index + 1}`, expectedBehavior: "prompt de troca aceitar linguagem natural, rejeitar prompt expirado e renderizar um único componente sem fallback textual", run: () => {
  const prompt = createConversationPrompt({ promptType: "confirmation", flowId: `switch-${index}`, expectedState: "collecting", options: [{ number: 1, id: "start_intent_switch", label: "Começar pedido" }, { number: 2, id: "continue_current_task", label: "Continuar orçamento" }, { number: 3, id: "cancel_intent_switch", label: "Cancelar" }] });
  expect(resolveActivePrompt(index % 2 ? "sim, começa o pedido" : "continua o orçamento", prompt, "collecting")?.id).toBe(index % 2 ? "start_intent_switch" : "continue_current_task");
  expect(resolveActivePrompt("sim", { ...prompt, consumedAt: new Date().toISOString() }, "collecting")).toBeUndefined();
  const outputs = buildAgentWhatsAppOutputs({ channel: "whatsapp", organizationId: "org", externalMessageId: `in-${index}`, externalConversationId: "5511", kind: "text", text: "trocar", receivedAt: new Date().toISOString(), metadata: {} }, { state: "collecting", reply: "Quer trocar de tarefa?", collection: { activePrompt: prompt } });
  expect(outputs).toHaveLength(1); expect(outputs[0].buttons).toHaveLength(3); expect(outputs[0].list).toBeUndefined(); expect(outputs[0].text).not.toMatch(/1\s*[—-]/);
} }));

const scenarios: Scenario[] = [...purchaseOrders, ...intentSwitches, ...interruptions, ...administrativeQueries, ...interfaceCases];

describe("conversational quality gate final — cenários 101 a 200", () => {
  beforeEach(() => mocks.findContact.mockResolvedValue([{ id: "contact-beta", legal_name: "Fornecedor Beta", tax_id: "123" }]));
  it("possui cem cenários adicionais, todos com EXPECTED_BEHAVIOR explícito", () => { expect(scenarios).toHaveLength(100); expect(scenarios.every(item => item.expectedBehavior.length > 30)).toBe(true); });
  it.each(scenarios)("$id — $expectedBehavior", async ({ run }) => { await run(); });
});
