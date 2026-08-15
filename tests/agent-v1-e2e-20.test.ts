import { describe, expect, it, vi } from "vitest";
import { processAgentV1Turn } from "@/lib/agent-v1/processor";
import { encodeBoundAction } from "@/lib/agent-v1/interactions";
import { mapLegacyContext } from "@/lib/agent-v1/legacy-mapper";
import { emptyAgentDraft } from "@/lib/ai/contracts";
import type { TaskStateV1 } from "@/lib/agent-v1/task-state";

const effects = () => ({
  create_quote: vi.fn(async () => ({
    resultRef:
      '{"documentId":"11111111-1111-4111-8111-111111111111","number":"ORC-1"}',
  })),
  create_purchase_order: vi.fn(async () => ({
    resultRef:
      '{"documentId":"22222222-2222-4222-8222-222222222222","number":"PC-1"}',
  })),
  generate_document_pdf: vi.fn(async () => ({
    resultRef:
      '{"url":"https://example.test/document.pdf","filename":"document.pdf"}',
  })),
  send_document: vi.fn(async () => ({ resultRef: "wamid.out.1" })),
  find_organization_tax_id: vi.fn(async () => ({
    resultRef: "00.000.000/0001-00",
  })),
  search_vault: vi.fn(async () => ({ resultRef: "Contrato Alfa" })),
  save_brand_logo: vi.fn(async () => ({ resultRef: "brand-1" })),
});
const turn = (
  message: string,
  task?: TaskStateV1,
  tools = effects(),
  buttonId?: string,
  brandingLogoRef?: string,
) =>
  processAgentV1Turn({
    message,
    task,
    tools,
    buttonId,
    brandingLogoRef,
    today: "2026-08-13",
    now: new Date("2026-08-13T12:00:00Z"),
  });
const quote =
  "Preciso fazer um orçamento para Alfa de 20 lâmpadas a R$30 cada, prazo de 20 dias, cartão de crédito em 2 vezes e validade de 30 dias.";
const assertV1 = (out: Awaited<ReturnType<typeof turn>>) => {
  expect(out.legacyAuthorityInvoked).toBe(false);
  expect(out.task.id).toBeTruthy();
  expect(out.task.revision).toBeGreaterThanOrEqual(0);
};

describe("20 transcripts E2E do processor Agent V1", () => {
  it("01 orçamento completo em uma mensagem", async () => {
    const out = await turn(quote);
    assertV1(out);
    expect(out.task.collectedData).toMatchObject({
      items: [{ quantity: 20, unitPrice: 30 }],
      totalPrice: 600,
    });
    expect(out.task.currentQuestion?.type).toBe("confirm_document");
  });
  it("02 orçamento em vários turnos", async () => {
    let out = await turn("Quero fazer um orçamento");
    out = await turn("para Alfa,", out.task);
    out = await turn("20 lâmpadas a R$30 cada", out.task);
    assertV1(out);
    expect(out.task.collectedData.items[0].description).toBe("Lâmpadas");
  });
  it("03 correção de quantidade preserva item", async () => {
    let out = await turn(
      "Quero fazer um orçamento para Alfa de 20 lâmpadas a R$30 cada",
    );
    out = await turn("10 lâmpadas a R$30 cada", out.task);
    assertV1(out);
    expect(out.task.collectedData.items[0].quantity).toBe(10);
  });
  it("04 correção de pagamento é atômica", async () => {
    let out = await turn(
      "Quero fazer um orçamento para Alfa de 20 lâmpadas a R$30 cada",
    );
    out = await turn("cartão de crédito em 2 vezes", out.task);
    assertV1(out);
    expect(out.task.collectedData.paymentDetails).toMatchObject({
      method: "credit_card",
      installments: 2,
    });
  });
  it("05 cliente cadastrado único", async () => {
    const tools = {
      ...effects(),
      resolve_party: vi.fn(async () => ({
        resultRef:
          '[{"contactId":"33333333-3333-4333-8333-333333333333","name":"Alfa Ltda","documentNumber":"001"}]',
      })),
    };
    const out = await turn(quote, undefined, tools);
    assertV1(out);
    expect(out.task.party).toMatchObject({
      source: "registered",
      role: "client",
      confirmed: true,
    });
  });
  it("06 cliente avulso", async () => {
    const tools = {
      ...effects(),
      resolve_party: vi.fn(async () => ({ resultRef: "[]" })),
    };
    const out = await turn(quote, undefined, tools);
    assertV1(out);
    expect(out.task.party).toMatchObject({ source: "ad_hoc", role: "client" });
    expect(out.task.currentQuestion?.type).toBe("party_cnpj");
  });
  it("07 CNPJ informado", async () => {
    const tools = {
      ...effects(),
      resolve_party: vi.fn(async () => ({ resultRef: "[]" })),
    };
    let out = await turn(quote, undefined, tools);
    out = await turn("12.345.678/0001-90", out.task, tools);
    assertV1(out);
    expect(out.task.party?.documentNumber).toBe("12345678000190");
  });
  it("08 CNPJ dispensado", async () => {
    const tools = {
      ...effects(),
      resolve_party: vi.fn(async () => ({ resultRef: "[]" })),
    };
    let out = await turn(quote, undefined, tools);
    out = await turn("sem CNPJ", out.task, tools);
    assertV1(out);
    expect(out.task.party?.documentNumber).toBeUndefined();
    expect(out.task.currentQuestion?.type).toBe("confirm_document");
  });
  it("09 pedido de compra completo", async () => {
    const out = await turn(
      "Preciso comprar 20 cadeiras da Alfa por R$250 cada, entrega em 15 dias, pagamento via PIX e endereço Rua A, 1.",
    );
    assertV1(out);
    expect(out.task.type).toBe("purchase_order");
    expect(out.task.collectedData.totalPrice).toBe(5000);
  });
  it("10 fornecedor avulso", async () => {
    const tools = {
      ...effects(),
      resolve_party: vi.fn(async () => ({ resultRef: "[]" })),
    };
    const out = await turn(
      "Preciso comprar 20 cadeiras da Alfa por R$250 cada, entrega em 15 dias, pagamento via PIX e endereço Rua A, 1.",
      undefined,
      tools,
    );
    assertV1(out);
    expect(out.task.party).toMatchObject({
      source: "ad_hoc",
      role: "supplier",
    });
  });
  it("11 CNPJ durante orçamento interrompe", async () => {
    let out = await turn(
      "Quero um orçamento para Alfa de 20 lâmpadas a R$30 cada",
    );
    const before = out.task.collectedData;
    out = await turn("qual é o CNPJ da minha empresa?", out.task);
    assertV1(out);
    expect(out.task.interruption?.kind).toBe("organization_tax_id");
    expect(out.task.collectedData).toEqual(before);
  });
  it("12 Cofre durante pedido interrompe", async () => {
    let out = await turn("Preciso comprar 20 cadeiras da Alfa por R$250 cada");
    out = await turn("localize o contrato da Alfa", out.task);
    assertV1(out);
    expect(out.task.interruption?.kind).toBe("vault_search");
  });
  it("13 retomada restaura pergunta", async () => {
    let out = await turn(
      "Quero um orçamento para Alfa de 20 lâmpadas a R$30 cada",
    );
    const question = out.task.currentQuestion;
    out = await turn("qual é o CNPJ da minha empresa?", out.task);
    const id = encodeBoundAction({
      actionId: "resume_task",
      taskId: out.task.id,
      revision: out.task.revision,
    });
    out = await turn("Continuar", out.task, effects(), id);
    assertV1(out);
    expect(out.task.currentQuestion).toEqual(question);
  });
  it("14 menu não destrói tarefa", async () => {
    let out = await turn(
      "Quero um orçamento para Alfa de 20 lâmpadas a R$30 cada",
    );
    const snapshot = out.task.collectedData;
    out = await turn("menu", out.task);
    assertV1(out);
    expect(out.task.collectedData).toEqual(snapshot);
  });
  it("15 saudação não destrói tarefa", async () => {
    let out = await turn(
      "Quero um orçamento para Alfa de 20 lâmpadas a R$30 cada",
    );
    const id = out.task.id;
    out = await turn("boa tarde", out.task);
    assertV1(out);
    expect(out.task.id).toBe(id);
  });
  it("16 confirmação por botão executa cadeia", async () => {
    const tools = effects();
    let out = await turn(quote, undefined, tools);
    const id = encodeBoundAction({
      actionId: "confirm_document",
      taskId: out.task.id,
      revision: out.task.revision,
    });
    out = await turn("Emitir", out.task, tools, id);
    assertV1(out);
    expect(out.task.effects).toMatchObject({
      document: { status: "completed" },
      pdf: { status: "completed" },
      delivery: { status: "completed", wamid: "wamid.out.1" },
    });
    expect(tools.create_quote).toHaveBeenCalledTimes(1);
  });
  it("17 confirmação por texto executa cadeia", async () => {
    const tools = effects();
    let out = await turn(quote, undefined, tools);
    out = await turn("pode emitir", out.task, tools);
    assertV1(out);
    expect(out.task.status).toBe("completed");
  });
  it("18 restart/retry não duplica documento", async () => {
    const tools = effects();
    tools.generate_document_pdf.mockRejectedValueOnce(
      new Error("PDF_STORAGE_FAILED"),
    );
    let out = await turn(quote, undefined, tools),
      id = encodeBoundAction({
        actionId: "confirm_document",
        taskId: out.task.id,
        revision: out.task.revision,
      });
    out = await turn("Emitir", out.task, tools, id);
    id = encodeBoundAction({
      actionId: "retry_pdf",
      taskId: out.task.id,
      revision: out.task.revision,
    });
    out = await turn("Tentar", structuredClone(out.task), tools, id);
    assertV1(out);
    expect(tools.create_quote).toHaveBeenCalledTimes(1);
    expect(out.task.status).toBe("completed");
  });
  it("19 branding pós-documento cria nova task", async () => {
    const tools = effects();
    let out = await turn(quote, undefined, tools),
      id = encodeBoundAction({
        actionId: "confirm_document",
        taskId: out.task.id,
        revision: out.task.revision,
      });
    out = await turn("Emitir", out.task, tools, id);
    const commercialId = out.task.id;
    id = encodeBoundAction({
      actionId: "personalize_now",
      taskId: out.task.id,
      revision: out.task.revision,
    });
    out = await turn("Personalizar", out.task, tools, id);
    expect(out.task.type).toBe("branding_setup");
    expect(out.task.id).not.toBe(commercialId);
    expect(out.task.currentQuestion?.type).toBe("brand_logo");
    out = await turn(
      "Logo recebida",
      out.task,
      tools,
      undefined,
      "org/logo.png",
    );
    assertV1(out);
    expect(out.task.status).toBe("completed");
  });
  it("20 contexto legado contaminado inicia task limpa", async () => {
    const mapped = mapLegacyContext({
      state: "awaiting_confirmation",
      context: {
        draft: {
          ...emptyAgentDraft(),
          type: "quote",
          counterpartyName: "Alfa",
          items: [
            {
              description: "vezes",
              quantity: 20,
              unit: "un",
              unitPrice: 30,
              discount: 0,
            },
          ],
          paymentTerms: "cartao",
        },
        collection: { expectedAnswer: "correction" },
        documentId: "old",
      },
    });
    const out = await turn(
      "Preciso fazer um orçamento para Beta de 10 cadeiras a R$50 cada, prazo 5 dias, PIX e validade 30 dias",
      mapped.task,
    );
    assertV1(out);
    expect(out.task.collectedData.items[0].description).toBe("Cadeiras");
    expect(out.task.id).not.toBe(mapped.task.id);
  });
});
