import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ activeBranding: vi.fn(), persistBranding: vi.fn(), findContact: vi.fn() }));
vi.mock("@/lib/branding/store", () => ({ activeBranding: mocks.activeBranding, persistBranding: mocks.persistBranding }));
vi.mock("@/lib/ai/tools", () => ({ findContact: mocks.findContact, createAgentDraft: vi.fn(), confirmAgentDocument: vi.fn(), queryDocuments: vi.fn() }));
import { emptyAgentDraft } from "@/lib/ai/contracts";
import { counterpartyRoleConflict, parseItemBundle, paymentOnlyUpdate } from "@/lib/ai/contextual-understanding";
import { applyEntitiesToAgentDraft, extractEntities } from "@/lib/orchestrator/entities";
import { runAgentTurn } from "@/lib/ai/turn";

const ctx = { organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", supabase: {} as never };
beforeEach(() => { mocks.findContact.mockReset(); mocks.findContact.mockResolvedValue([]); });

describe("motor de compreensão contextual", () => {
  it("não inventa contraparte quando orçamento e fornecedor entram em conflito", async () => {
    expect(counterpartyRoleConflict("Faça um orçamento para o fornecedor Alfa")).toEqual({ name: "Alfa" });
    const result = await runAgentTurn(ctx, { action: "message", text: "Faça um orçamento para o fornecedor Alfa", idempotencyKey: "role", state: "collecting", draft: emptyAgentDraft(), collection: {} });
    expect(result.state).toBe("collecting");
    expect(result.draft.counterpartyName).toBeNull();
    expect(result.draft.items).toEqual([]);
    expect(result.reply).toMatch(/orçamento para um cliente|pedido de compra/i);
  });

  it("separa produto, quantidade, unitário e total sem usar ‘unidades’ como item", async () => {
    expect(parseItemBundle("São lâmpadas, 20 unidades, 30 reais cada")).toMatchObject({ description: "lampadas", quantity: 20, unitPrice: 30, total: 600, itemType: "product" });
    const result = await runAgentTurn(ctx, { action: "message", text: "São lâmpadas, 20 unidades, 30 reais cada", idempotencyKey: "item", state: "collecting", draft: { ...emptyAgentDraft(), type: "quote", counterpartyName: "Cliente Alfa" }, collection: { pendingField: "itens" } });
    expect(result.draft).toMatchObject({ itemType: "product", totalPrice: 600, items: [{ description: "lampadas", quantity: 20, unitPrice: 30 }] });
    expect(result.draft.items[0].description).not.toMatch(/unidades/i);
  });

  it("interpreta pagamento sem sobrescrever item ou quantidade confirmados", async () => {
    expect(paymentOnlyUpdate("cartão de crédito 2 vezes")).toMatchObject({ method: "credit_card", installments: 2 });
    const item = { description: "lâmpadas", quantity: 20, unit: "un", unitPrice: 30, discount: 0 };
    const draft = { ...emptyAgentDraft(), type: "quote" as const, counterpartyName: "Cliente Alfa", items: [item], itemType: "product" as const, deadline: "5 dias" };
    const result = await runAgentTurn(ctx, { action: "message", text: "cartão de crédito 2 vezes", idempotencyKey: "payment", state: "collecting", draft, collection: { pendingField: "condição de pagamento" } });
    expect(result.draft.items).toEqual([item]);
    expect(result.draft.paymentDetails).toMatchObject({ method: "credit_card", installments: 2 });
    expect(result.draft.paymentTerms).toMatch(/Cartão de crédito.*2 vezes/);
  });

  it("aceita frase natural com quantidade antes do produto", () => {
    expect(parseItemBundle("São 20 lâmpadas a 30 reais cada")).toMatchObject({ description: "lampadas", quantity: 20, unitPrice: 30, total: 600, itemType: "product" });
    expect(parseItemBundle("20 lampada 30 cada")).toMatchObject({ description: "lampada", quantity: 20, unitPrice: 30, total: 600 });
  });

  it("reproduz o pré-merge real sem deixar parcelas contaminarem o produto", () => {
    const text = "Preciso fazer um orçamento para a Alfa.\nSão 20 lâmpadas a R$ 30 cada.\nPrazo de 20 dias.\nCartão de crédito em 2 vezes.";
    const entities = extractEntities(text);
    const draft = applyEntitiesToAgentDraft(emptyAgentDraft(), entities, "quote");
    expect(entities).toMatchObject({ service: { value: "Lâmpadas" }, quantity: { value: 20 }, payment_terms: { value: "Cartão de crédito em 2 vezes" } });
    expect(draft).toMatchObject({ itemType: "product", items: [{ description: "Lâmpadas", quantity: 20, unitPrice: 30 }], paymentTerms: "Cartão de crédito em 2 vezes", paymentDetails: { method: "credit_card", installments: 2, display: "Cartão de crédito em 2 vezes" } });
  });

  it.each(["vez", "vezes", "parcela", "parcelas", "cartão", "cartão de crédito", "pix", "boleto", "dinheiro", "entrada", "à vista"])("bloqueia %s como descrição isolada", (description) => {
    const draft = applyEntitiesToAgentDraft(emptyAgentDraft(), { service: { value: description, raw: description, source: "user_message", confidence: .99, normalized: description, requiresConfirmation: false }, quantity: { value: 2, raw: "2", source: "user_message", confidence: .99, normalized: "2", requiresConfirmation: false }, price: { value: 30, raw: "30", source: "user_message", confidence: .99, normalized: "30", requiresConfirmation: false }, value_scope: { value: "unit", raw: "cada", source: "user_message", confidence: .99, normalized: "unit", requiresConfirmation: false } }, "quote");
    expect(draft.items).toEqual([]);
  });

  it("aceita pagamento adicional de alta confiança junto do prazo", async () => {
    const item = { description: "lâmpadas", quantity: 20, unit: "un", unitPrice: 30, discount: 0 };
    const draft = { ...emptyAgentDraft(), type: "quote" as const, counterpartyName: "Cliente Alfa", items: [item], itemType: "product" as const };
    const result = await runAgentTurn(ctx, { action: "message", text: "10 dias e o pagamento pode ser pix à vista", idempotencyKey: "deadline-payment", state: "collecting", draft, collection: { pendingField: "prazo" } });
    expect(result.draft).toMatchObject({ deadline: "10 dias", paymentTerms: "PIX à vista", paymentDetails: { method: "pix" }, items: [item] });
  });

  it("corrige quantidade explicitamente, recalcula e preserva os demais campos", async () => {
    const item = { description: "lâmpadas", quantity: 20, unit: "un", unitPrice: 30, discount: 0 };
    const draft = { ...emptyAgentDraft(), type: "quote" as const, counterpartyName: "Cliente Alfa", items: [item], itemType: "product" as const, deadline: "10 dias", paymentTerms: "PIX" };
    const result = await runAgentTurn(ctx, { action: "message", text: "Na verdade são 25 lâmpadas", idempotencyKey: "correction", state: "collecting", draft, collection: { pendingField: "correção" } });
    expect(result.draft).toMatchObject({ counterpartyName: "Cliente Alfa", deadline: "10 dias", paymentTerms: "PIX", totalPrice: 750, items: [{ description: "lâmpadas", quantity: 25, unitPrice: 30 }] });
  });

  it.each(Array.from({ length: 100 }, (_, index) => [`Produto ${index + 1}, ${index + 1} unidades, ${index + 2} reais cada`, index + 1, index + 2] as const))(
    "mantém os papéis semânticos na combinação sintética %s",
    (text, quantity, unitPrice) => {
      const parsed = parseItemBundle(text);
      expect(parsed).toMatchObject({ quantity, unitPrice, total: quantity * unitPrice });
      expect(parsed?.description).not.toMatch(/^(?:unidades?|itens?)$/i);
    },
  );
});
