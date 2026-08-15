import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { activeBranding, createAgentDraft, reserveAgentDocumentNumber } = vi.hoisted(() => ({ activeBranding: vi.fn(), createAgentDraft: vi.fn(), reserveAgentDocumentNumber: vi.fn() }));
vi.mock("@/lib/branding/store", () => ({ activeBranding, persistBranding: vi.fn() }));
vi.mock("@/lib/ai/tools", () => ({ createAgentDraft, reserveAgentDocumentNumber, confirmAgentDocument: vi.fn(), queryDocuments: vi.fn() }));
import { runAgentTurn } from "@/lib/ai/turn";
import type { AgentDraft } from "@/lib/ai/contracts";
import { buildAgentWhatsAppOutputs } from "@/lib/whatsapp/agent-bridge";
import { lumeMessages } from "@/lib/whatsapp/lume-messages";

const oldDraft: AgentDraft = { type: "quote", counterpartyName: "Cliente anterior", items: [{ description: "Item anterior", quantity: 1, unit: "un", unitPrice: 2500, discount: 0 }], shipping: 0, validity: "2027-08-08", deadline: "10 dias", paymentTerms: "À vista", deliveryAddress: null, notes: "Não reutilizar", documentQuery: null };
const oldSummary = { draft: oldDraft, fingerprint: "hash-anterior", text: "Resumo anterior", presentedAt: "2026-08-04T00:00:00.000Z" };
const ctx = { organizationId: crypto.randomUUID(), userId: crypto.randomUUID(), supabase: {} as never };
const turn = (state: "cancelled" | "confirmed", action: "message" | "create_quote" | "create_purchase_order", text: string) => runAgentTurn(ctx, { state, action, text, idempotencyKey: crypto.randomUUID(), draft: oldDraft, documentId: crypto.randomUUID(), collection: { summary: oldSummary, pendingField: "confirmação", confirmationAttempts: 1 } });

describe("nova sessão lógica após estados terminais", () => {
  beforeEach(() => { vi.clearAllMocks(); activeBranding.mockResolvedValue({ status: "configured" }); });
  it.each(["cancelled", "confirmed"] as const)("%s + Olá Lume abre menu limpo", async (state) => {
    const result = await turn(state, "message", "Olá Lume");
    expect(result).toMatchObject({ state: "menu", documentId: undefined, reply: lumeMessages.opening });
    expect(result.draft).toMatchObject({ type: null, counterpartyName: null, items: [] });
    expect(result.collection.summary).toBeUndefined();
    const outputs = buildAgentWhatsAppOutputs({ channel: "whatsapp", organizationId: ctx.organizationId, externalMessageId: "wamid.new", externalConversationId: "5511", kind: "text", text: "Olá Lume", receivedAt: new Date().toISOString(), metadata: {} }, result);
    expect(outputs).toHaveLength(1);
    expect(outputs[0].buttons).toBeUndefined();
  });
  it.each([["create_quote", "quote", lumeMessages.customer], ["create_purchase_order", "purchase_order", lumeMessages.supplier]] as const)("cancelled + %s cria operação limpa", async (action, type, reply) => {
    const result = await turn("cancelled", action, action);
    expect(result.state).toBe("collecting"); expect(result.draft.type).toBe(type); expect(result.reply).toBe(reply);
    expect(result.draft.counterpartyName).toBeNull(); expect(result.draft.items).toEqual([]); expect(result.documentId).toBeUndefined();
    expect(createAgentDraft).not.toHaveBeenCalled(); expect(reserveAgentDocumentNumber).not.toHaveBeenCalled();
  });
  it("confirmed + nova intenção inicia outra operação sem alterar documento existente", async () => {
    const result = await turn("confirmed", "create_quote", "Criar orçamento");
    expect(result).toMatchObject({ state: "collecting", documentId: undefined, draft: { type: "quote", items: [] } });
    expect(createAgentDraft).not.toHaveBeenCalled();
  });
});
