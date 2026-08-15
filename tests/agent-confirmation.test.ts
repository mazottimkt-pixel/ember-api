import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { createAgentDraft, confirmAgentDocument } = vi.hoisted(() => ({
  createAgentDraft: vi.fn(),
  confirmAgentDocument: vi.fn(),
}));
vi.mock("@/lib/ai/tools", () => ({
  createAgentDraft,
  confirmAgentDocument,
  findContact: vi.fn(async () => [{ id: "018f7787-0d65-7f68-8176-74f8db53d508", legal_name: "Cliente Teste", tax_id: null }]),
  queryDocuments: vi.fn(),
}));
import type { AgentDraft } from "@/lib/ai/contracts";
import { buildAgentReviewSummary } from "@/lib/ai/summary";
import { runAgentTurn } from "@/lib/ai/turn";
import type { AgentToolContext } from "@/lib/ai/tools";

const draft: AgentDraft = {
  type: "quote", counterpartyName: "Cliente Teste",
  items: [{ description: "Serviço", quantity: 1, unit: "un", unitPrice: 100, discount: 0 }],
  shipping: 0, validity: "2026-08-10", deadline: "5 dias", paymentTerms: "Pix",
  deliveryAddress: null, notes: null, documentQuery: null,
};
const documentId = "018f7787-0d65-7f68-8176-74f8db53d505";
const ctx = { organizationId: "018f7787-0d65-7f68-8176-74f8db53d506", userId: "018f7787-0d65-7f68-8176-74f8db53d507" } as AgentToolContext;

describe("confirmação idempotente do agente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAgentDraft.mockResolvedValue({ id: documentId, number: "ORC-2026-000001" });
    confirmAgentDocument.mockResolvedValue({ id: documentId, number: "ORC-2026-000001" });
  });

  it("confirma usando o último rascunho apresentado e cria uma única vez", async () => {
    const summary = buildAgentReviewSummary(draft);
    const first = await runAgentTurn(ctx, {
      action: "confirm", text: "Confirmar", idempotencyKey: "wamid.button.1",
      state: "awaiting_confirmation", draft, collection: { summary },
    });
    expect(first.state).toBe("confirmed");
    expect(first.documentId).toBe(documentId);
    expect(first.reply).not.toContain("Resumo do orçamento");
    expect(createAgentDraft).toHaveBeenCalledOnce();
    expect(createAgentDraft.mock.calls[0][1]).toEqual(summary.draft);
    expect(confirmAgentDocument).toHaveBeenCalledOnce();

    const duplicate = await runAgentTurn(ctx, {
      action: "confirm", text: "Confirmar", idempotencyKey: "wamid.button.2",
      state: first.state, draft: first.draft, documentId: first.documentId, collection: first.collection,
    });
    expect(duplicate.state).toBe("confirmed");
    expect(duplicate.documentId).toBe(documentId);
    expect(createAgentDraft).toHaveBeenCalledOnce();
    expect(confirmAgentDocument).toHaveBeenCalledOnce();
  });

  it("não recria o documento quando a primeira tentativa falha após a criação", async () => {
    const summary = buildAgentReviewSummary(draft, { presentedAt: "2026-08-04T00:00:00.000Z" });
    const requests = new Set<string>();
    let insertedDocuments = 0;
    createAgentDraft.mockImplementation(async (_ctx, _draft, requestId: string) => {
      if (!requests.has(requestId)) { requests.add(requestId); insertedDocuments += 1; }
      return { id: documentId, number: "ORC-2026-000001" };
    });
    confirmAgentDocument.mockRejectedValueOnce(new Error("CONFIRM_TEMPORARY_FAILURE")).mockResolvedValueOnce({ id: documentId, number: "ORC-2026-000001" });
    const input = { action: "confirm" as const, text: "Confirmar", idempotencyKey: "wamid.first", state: "awaiting_confirmation" as const, draft, collection: { summary } };
    await expect(runAgentTurn(ctx, input)).rejects.toThrow("CONFIRM_TEMPORARY_FAILURE");
    await expect(runAgentTurn(ctx, { ...input, idempotencyKey: "wamid.retry" })).resolves.toMatchObject({ state: "confirmed", documentId });
    expect(new Set(createAgentDraft.mock.calls.map((call) => call[2])).size).toBe(1);
    expect(insertedDocuments).toBe(1);
  });

  it("retry de PDF reutiliza somente o documento confirmado", async () => {
    const result = await runAgentTurn(ctx, {
      action: "retry_pdf", text: "Gerar PDF", idempotencyKey: "wamid.pdf.retry",
      state: "confirmed", draft, documentId, collection: { summary: buildAgentReviewSummary(draft) },
    });
    expect(result).toMatchObject({ state: "confirmed", documentId });
    expect(result.reply).toContain("PDF");
    expect(createAgentDraft).not.toHaveBeenCalled();
    expect(confirmAgentDocument).not.toHaveBeenCalled();
  });
});
