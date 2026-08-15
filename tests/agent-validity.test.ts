import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { parseQuoteValidity } from "@/lib/ai/validity";
import { runAgentTurn } from "@/lib/ai/turn";
import type { AgentDraft } from "@/lib/ai/contracts";
import type { AgentToolContext } from "@/lib/ai/tools";

const today = "2026-08-03";
const completeExceptValidity: AgentDraft = {
  type: "quote",
  counterpartyName: "Clínica Alfa",
  items: [{ description: "Manutenção", quantity: 12, unit: "un", unitPrice: 180, discount: 0 }],
  shipping: 0,
  validity: null,
  deadline: "5 dias",
  paymentTerms: "50% na aprovação e 50% na conclusão",
  deliveryAddress: null,
  notes: "Dados anteriores preservados",
  documentQuery: null,
};
const ctx = {} as AgentToolContext;
const turn = (text: string, collection: Record<string, unknown> = {}) => runAgentTurn(ctx, {
  action: "message", text, idempotencyKey: crypto.randomUUID(), state: "collecting",
  draft: completeExceptValidity, collection: { party: { source: "registered", name: "Clínica Alfa", contactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, ...collection }, today,
});

describe("validade de orçamento", () => {
  it.each([
    ["5 dias", "2026-08-08"],
    ["10 dias", "2026-08-13"],
    ["válido por 7 dias", "2026-08-10"],
    ["10/08/2026", "2026-08-10"],
    ["até 10/08/2026", "2026-08-10"],
    ["10 de agosto de 2026", "2026-08-10"],
    ["validade de 7 dias", "2026-08-10"],
    ["por sete dias", "2026-08-10"],
    ["uma semana", "2026-08-10"],
    ["validade de uma semana", "2026-08-10"],
    ["vence em 7 dias", "2026-08-10"],
    ["validade até 10/08/2026", "2026-08-10"],
  ])("aceita %s", (input, expected) => {
    expect(parseQuoteValidity(input, today)).toMatchObject({ success: true, canonical: expected });
  });

  it("rejeita data passada com motivo específico", () =>
    expect(parseQuoteValidity("02/08/2026", today)).toEqual({ success: false, reason: "A validade precisa terminar depois da data de hoje.\n\nInforme uma nova data ou um prazo em dias." }));

  it("rejeita data impossível com motivo específico", () =>
    expect(parseQuoteValidity("31/02/2027", today)).toEqual({ success: false, reason: "A data informada não existe no calendário.\n\nConfira o dia, o mês e o ano e envie novamente." }));

  it.each(["0 dias", "-2 dias"])("rejeita duração inválida %s", (value) => expect(parseQuoteValidity(value, today).success).toBe(false));

  it("expõe a normalização estruturada", () => expect(parseQuoteValidity("validade de 7 dias", today)).toMatchObject({ success: true, kind: "duration", value: 7, unit: "days", display: "7 dias" }));

  it("preserva campos e conclui a coleta sem loop", async () => {
    const result = await turn("5 dias");
    expect(result.state).toBe("awaiting_confirmation");
    expect(result.draft).toMatchObject({ counterpartyName: "Clínica Alfa", items: completeExceptValidity.items, paymentTerms: completeExceptValidity.paymentTerms, validity: "2026-08-08" });
    expect(result.reply).not.toContain("Qual é a data");
  });

  it("explica o erro anterior ao receber por que não e mantém o campo", async () => {
    const failed = await turn("31/02/2027");
    const reason = await turn("Por que não?", failed.collection);
    expect(reason.reply).toContain("não existe no calendário");
    expect(reason.reply).toContain("Continuamos na validade");
    expect(reason.draft).toEqual(completeExceptValidity);
    expect(reason.collection.pendingField).toBe("validade");
  });

  it("após duas falhas oferece exemplos sem repetir indefinidamente", async () => {
    const first = await turn("qualquer coisa");
    const second = await turn("ontem talvez", first.collection);
    expect(first.reply).toContain("Informe novamente");
    expect(second.reply).toContain("Você pode responder de uma destas formas:");
    expect(second.collection.validity?.attempts).toBe(2);
    expect(second.reply).not.toBe(first.reply);
  });
});
