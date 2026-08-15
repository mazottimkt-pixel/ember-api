import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ findContact: vi.fn() }));
vi.mock("@/lib/branding/store", () => ({ activeBranding: vi.fn(), persistBranding: vi.fn() }));
vi.mock("@/lib/ai/tools", () => ({ findContact: mocks.findContact, createAgentDraft: vi.fn(), confirmAgentDocument: vi.fn(), queryDocuments: vi.fn() }));

import { emptyAgentDraft } from "@/lib/ai/contracts";
import { parseCounterpartyAnswer } from "@/lib/ai/contextual-understanding";
import { runAgentTurn } from "@/lib/ai/turn";
import { extractEntities } from "@/lib/orchestrator/entities";

const ctx = { organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", supabase: {} as never };

describe("contraparte contextual e resposta esperada", () => {
  beforeEach(() => mocks.findContact.mockResolvedValue([]));

  it.each([
    ["orçamento para Alfa de 20 cadeiras a R$ 30 cada", "Alfa"],
    ["orçamento para Alfa Ltda de 20 cadeiras a R$ 30 cada", "Alfa Ltda"],
    ["orçamento para Grupo Medmais de 20 cadeiras a R$ 30 cada", "Grupo Medmais"],
    ["cotação para XPTO Comércio e Serviços de 20 cadeiras a R$ 30 cada", "XPTO Comércio e Serviços"],
    ["orçamento para João da Silva ME de 20 cadeiras a R$ 30 cada", "João da Silva ME"],
    ["orçamento para ACME de 20 cadeiras a R$ 30 cada", "ACME"],
    ["orçamento para o cliente Beta de 20 cadeiras a R$ 30 cada", "Beta"],
    ["pedido de compra para o fornecedor Gamma de 20 cadeiras a R$ 30 cada", "Gamma"],
  ])("extrai contraparte de %s", (message, expected) => expect(extractEntities(message).customer?.value).toBe(expected));

  it.each(["Alfa", "Alfa Ltda", "Grupo Medmais", "XPTO", "João da Silva ME"])("consome resposta curta válida: %s", async (name) => {
    expect(parseCounterpartyAnswer(name)).toBe(name);
    const result = await runAgentTurn(ctx, { action: "message", text: name, idempotencyKey: `counterparty:${name}`, state: "collecting", draft: { ...emptyAgentDraft(), type: "quote" }, collection: { pendingField: "cliente", expectedAnswer: "counterparty" } });
    expect(result.draft.counterpartyName).toBe(name); expect(result.reply).not.toMatch(/nome ou a razão social/i); expect(result.collection.expectedAnswer).not.toBe("counterparty");
  });

  it.each(["cancela", "esquece", "quero fazer pedido de compra", "volta", "faz outra coisa"])("não interpreta comando como contraparte: %s", (message) => expect(parseCounterpartyAnswer(message)).toBeUndefined());

  it.each([
    ["prazo de entrega de 20 dias", "20 dias", undefined],
    ["entrega em 20 dias", "20 dias", undefined],
    ["executamos em 20 dias", "20 dias", undefined],
    ["validade de 20 dias", undefined, "20 dias"],
    ["orçamento válido por 20 dias", undefined, "20 dias"],
  ])("separa prazo e validade em %s", (message, deadline, validityRaw) => {
    const entities = extractEntities(message, { today: "2026-08-15" });
    expect(entities.requested_date?.value).toBe(deadline); expect(entities.validity?.raw).toBe(validityRaw);
  });
});
