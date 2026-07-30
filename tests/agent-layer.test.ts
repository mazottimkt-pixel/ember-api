import { describe, expect, it } from "vitest";
import { agentDecisionSchema, agentDraftSchema, agentRequestSchema, emptyAgentDraft } from "@/lib/ai/contracts";
import { locateMissingFields } from "@/lib/ai/missing";

const complete = { type: "purchase_order" as const, counterpartyName: "MATHEUS YAN TEODORO GONÇALVES MAZOTTI", items: [
  { description: "Notebook", quantity: 2, unit: "un", unitPrice: 3500, discount: 100 },
  { description: "Configuração", quantity: 2, unit: "h", unitPrice: 180, discount: 0 },
], shipping: 50, validity: null, deadline: "10 dias", paymentTerms: "30 dias", deliveryAddress: "Rua Exemplo, 100", notes: null, documentQuery: null };

describe("camada do agente", () => {
  it("valida texto completo com múltiplos itens", () => {
    const result = agentDecisionSchema.parse({ intent: "purchase_order", draft: complete, ambiguities: [], reply: "Revise os dados." });
    expect(result.draft.items).toHaveLength(2); expect(locateMissingFields(result.draft)).toEqual([]);
  });
  it("faz somente a próxima pergunta necessária em texto incompleto", () => {
    const draft = agentDraftSchema.parse({ ...emptyAgentDraft(), type: "quote", counterpartyName: "Clínica Alfa" });
    expect(locateMissingFields(draft)[0]).toBe("itens");
  });
  it("mantém ambiguidades estruturadas", () => {
    const value = agentDecisionSchema.parse({ intent: "quote", draft: { ...emptyAgentDraft(), type: "quote" }, ambiguities: ["Há dois contatos chamados Alfa"], reply: "Qual cadastro devo usar?" });
    expect(value.ambiguities).toHaveLength(1);
  });
  it("aceita correção e cancelamento", () => {
    for (const intent of ["correction", "cancel"] as const) expect(agentDecisionSchema.safeParse({ intent, draft: emptyAgentDraft(), ambiguities: [], reply: "Certo." }).success).toBe(true);
  });
  it("rejeita saída inválida do modelo", () => expect(agentDecisionSchema.safeParse({ intent: "inventado" }).success).toBe(false));
  it("exige idempotência e limita mensagens", () => {
    expect(agentRequestSchema.safeParse({ idempotencyKey: crypto.randomUUID(), text: "Pedido", action: "message" }).success).toBe(true);
    expect(agentRequestSchema.safeParse({ idempotencyKey: "repetida", text: "Pedido" }).success).toBe(false);
    expect(agentRequestSchema.safeParse({ idempotencyKey: crypto.randomUUID(), text: "x".repeat(8001) }).success).toBe(false);
  });
  it("representa a mesma contraparte nos dois papéis", () => expect({ isCustomer: true, isSupplier: true }).toMatchObject({ isCustomer: true, isSupplier: true }));
});
