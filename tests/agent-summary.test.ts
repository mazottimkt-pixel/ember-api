import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { AgentDraft } from "@/lib/ai/contracts";
import { buildAgentReviewSummary, confirmationRequestId, differingAgentDraftFields, fingerprintAgentDraft, reviewMatchesDraft } from "@/lib/ai/summary";
import { runAgentTurn } from "@/lib/ai/turn";
import type { AgentToolContext } from "@/lib/ai/tools";

const quote = (overrides: Partial<AgentDraft> = {}): AgentDraft => ({
  type: "quote", counterpartyName: "Caroline Mazotti",
  items: [{ description: "Criação de site institucional", quantity: 1, unit: "un", unitPrice: 2500, discount: 0 }],
  shipping: 0, validity: "2026-08-08", deadline: "10 dias",
  paymentTerms: "Cartão de crédito em até 10x", deliveryAddress: null,
  notes: null, documentQuery: null, ...overrides,
});

describe("resumo comercial antes da confirmação", () => {
  it("formata um item, parcelamento, moeda e validade em dias", () => {
    const summary = buildAgentReviewSummary(quote(), { validityFriendlyText: "válido por 5 dias (até 08/08/2026)" });
    expect(summary.text).toContain("Revise os dados do orçamento");
    expect(summary.text).toContain("Cliente: Caroline Mazotti");
    expect(summary.text).toContain("Quantidade: 1");
    expect(summary.text).toContain("Valor unitário: R$ 2.500,00");
    expect(summary.text).toContain("Cartão de crédito em até 10x");
    expect(summary.text).toContain("5 dias — até 08/08/2026");
  });

  it("resume múltiplos itens, desconto, acréscimo e observações", () => {
    const summary = buildAgentReviewSummary(quote({
      items: [
        { description: "Produto A", quantity: 2, unit: "un", unitPrice: 100, discount: 10 },
        { description: "Serviço B", quantity: 1.5, unit: "h", unitPrice: 200, discount: 0 },
      ],
      shipping: 25, notes: "Entrega pela manhã.",
    }));
    expect(summary.text).toContain("Descrição: Serviço B");
    expect(summary.text).toContain("Quantidade: 1,5");
    expect(summary.text).toContain("Desconto: R$ 10,00");
    expect(summary.text).toContain("*Frete ou acréscimo*\nR$ 25,00");
    expect(summary.text).toContain("Observações: Entrega pela manhã.");
    expect(summary.text).toContain("Total: *R$ 515,00*");
  });

  it("usa rótulo e prazo semânticos para produto e bloqueia termo de pagamento como descrição", () => {
    const product = buildAgentReviewSummary(quote({ itemType: "product", items: [{ description: "Lâmpadas", quantity: 20, unit: "un", unitPrice: 30, discount: 0 }], deadline: "20 dias", paymentTerms: "Cartão de crédito em 2 vezes" }));
    expect(product.text).toContain("Produto: Lâmpadas");
    expect(product.text).toContain("Prazo de entrega: 20 dias");
    expect(() => buildAgentReviewSummary(quote({ items: [{ description: "vezes", quantity: 20, unit: "un", unitPrice: 30, discount: 0 }] }))).toThrow("PAYMENT_TERM_AS_ITEM_DESCRIPTION");
  });

  it("exibe validade absoluta no padrão brasileiro", () =>
    expect(buildAgentReviewSummary(quote()).text).toContain("*Validade*\naté 08/08/2026"));

  it("gera resumo completo de pedido de compra", () => {
    const summary = buildAgentReviewSummary(quote({
      type: "purchase_order", validity: null, counterpartyName: "Fornecedor Alfa",
      deliveryAddress: "Rua das Flores, 100",
    }));
    expect(summary.text).toContain("Revise os dados do pedido de compra");
    expect(summary.text).toContain("Fornecedor: Fornecedor Alfa");
    expect(summary.text).toContain("Endereço de entrega: Rua das Flores, 100");
    expect(summary.text).not.toMatch(/1 — Confirmar|2 — Corrigir|3 — Cancelar/);
  });

  it("inclui CNPJ normalizado no snapshot apresentado e no hash", () => {
    const withoutTaxId = buildAgentReviewSummary(quote({ type: "purchase_order", validity: null, deliveryAddress: "Rua A, 1" }));
    const withTaxId = buildAgentReviewSummary(quote({ type: "purchase_order", validity: null, deliveryAddress: "Rua A, 1" }), { partyTaxId: "09.557.452/0001-43" });
    expect(withTaxId.text).toContain("CNPJ: 09.557.452/0001-43");
    expect(withTaxId.fingerprint).not.toBe(withoutTaxId.fingerprint);
  });

  it("vincula a confirmação exatamente ao último rascunho resumido", () => {
    const draft = quote();
    const summary = buildAgentReviewSummary(draft);
    expect(reviewMatchesDraft(summary, draft)).toBe(true);
    expect(reviewMatchesDraft(summary, quote({ paymentTerms: "Pix" }))).toBe(false);
  });

  it("mantém hash canônico com propriedades em ordem diferente", () => {
    const draft = quote();
    const reordered = Object.fromEntries(Object.entries(draft).reverse()) as AgentDraft;
    expect(fingerprintAgentDraft(reordered)).toBe(fingerprintAgentDraft(draft));
    expect(differingAgentDraftFields(draft, reordered)).toEqual([]);
    expect(confirmationRequestId("018f7787-0d65-7f68-8176-74f8db53d505", fingerprintAgentDraft(draft), "2026-08-04T00:00:00.000Z"))
      .toBe(confirmationRequestId("018f7787-0d65-7f68-8176-74f8db53d505", fingerprintAgentDraft(reordered), "2026-08-04T00:00:00.000Z"));
  });

  it("identifica exatamente divergência real no rascunho", () => {
    expect(differingAgentDraftFields(quote(), quote({ paymentTerms: "Pix" }))).toEqual(["paymentTerms"]);
  });

  it("bloqueia confirmação sem resumo e apresenta o resumo primeiro", async () => {
    const result = await runAgentTurn({} as AgentToolContext, {
      action: "confirm", text: "", idempotencyKey: crypto.randomUUID(), state: "awaiting_confirmation", draft: quote(), collection: {},
    });
    expect(result.state).toBe("awaiting_confirmation");
    expect(result.reply).toContain("Revise os dados do orçamento");
    expect(result.collection.summary).toBeDefined();
  });

  it("Corrigir preserva dados, invalida o resumo e exige novo resumo", async () => {
    const draft = quote();
    const oldSummary = buildAgentReviewSummary(draft);
    const result = await runAgentTurn({} as AgentToolContext, {
      action: "correct", text: "", idempotencyKey: crypto.randomUUID(), state: "awaiting_confirmation", draft, collection: { summary: oldSummary },
    });
    expect(result.draft).toEqual(draft);
    expect(result.collection.summary).toBeUndefined();
    expect(result.reply).toContain("Qual informação deseja corrigir");
    const newSummary = buildAgentReviewSummary(quote({ items: [{ ...draft.items[0], quantity: 2 }] }));
    expect(newSummary.fingerprint).not.toBe(oldSummary.fingerprint);
    expect(newSummary.text).toContain("Quantidade: 2");
  });
});
