import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AgentDraft } from "@/lib/ai/contracts";
import { createAgentDraft, reserveAgentDocumentNumber, type AgentToolContext } from "@/lib/ai/tools";

function chain(result: { data: unknown; error: unknown }) {
  const value: Record<string, ReturnType<typeof vi.fn>> = {};
  value.select = vi.fn(() => value);
  value.eq = vi.fn(() => value);
  value.update = vi.fn(() => value);
  value.insert = vi.fn(async () => result);
  value.maybeSingle = vi.fn(async () => result);
  return value;
}

const context = (rpc: ReturnType<typeof vi.fn>, from: ReturnType<typeof vi.fn>) => ({
  organizationId: "018f7787-0d65-7f68-8176-74f8db53d506",
  userId: "018f7787-0d65-7f68-8176-74f8db53d507",
  supabase: { rpc, from },
}) as unknown as AgentToolContext;

describe("reserva de numeração do agente", () => {
  it("mantém o RPC como caminho principal", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "ORC-2026-000004", error: null });
    const from = vi.fn();

    await expect(reserveAgentDocumentNumber(context(rpc, from), "quote", 2026))
      .resolves.toBe("ORC-2026-000004");
    expect(from).not.toHaveBeenCalled();
  });

  it("reserva a mesma sequência via service role quando auth.uid() causa forbidden", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "forbidden" },
    });
    const selected = chain({ data: { next_value: 7 }, error: null });
    const updated = chain({ data: { next_value: 8 }, error: null });
    const from = vi.fn()
      .mockReturnValueOnce(selected)
      .mockReturnValueOnce(updated);

    await expect(reserveAgentDocumentNumber(context(rpc, from), "quote", 2026))
      .resolves.toBe("ORC-2026-000007");
    expect(updated.update).toHaveBeenCalledWith({ next_value: 8 });
    expect(updated.eq).toHaveBeenLastCalledWith("next_value", 7);
  });

  it("refaz a leitura após corrida de criação sem duplicar o número", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "forbidden" },
    });
    const missing = chain({ data: null, error: null });
    const racedInsert = chain({ data: null, error: { code: "23505" } });
    const selected = chain({ data: { next_value: 2 }, error: null });
    const updated = chain({ data: { next_value: 3 }, error: null });
    const from = vi.fn()
      .mockReturnValueOnce(missing)
      .mockReturnValueOnce(racedInsert)
      .mockReturnValueOnce(selected)
      .mockReturnValueOnce(updated);

    await expect(reserveAgentDocumentNumber(context(rpc, from), "purchase_order", 2026))
      .resolves.toBe("PC-2026-000002");
    expect(racedInsert.insert).toHaveBeenCalledOnce();
    expect(updated.update).toHaveBeenCalledOnce();
  });

  it("não mascara falhas de configuração ou erros diferentes do worker", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message: "permission denied" },
    });

    await expect(reserveAgentDocumentNumber(context(rpc, vi.fn()), "quote", 2026))
      .rejects.toThrow("NUMBER_FAILED");
  });

  it("reutiliza o request_id confirmado antes de tentar reservar outro número", async () => {
    const existing = chain({
      data: {
        id: "018f7787-0d65-7f68-8176-74f8db53d505",
        number: "ORC-2026-000007",
        status: "confirmed",
      },
      error: null,
    });
    const rpc = vi.fn();
    const from = vi.fn().mockReturnValue(existing);
    const draft: AgentDraft = {
      type: "quote",
      counterpartyName: "Cliente Teste",
      items: [{ description: "Serviço", quantity: 1, unit: "un", unitPrice: 100, discount: 0 }],
      shipping: 0,
      validity: "2026-08-10",
      deadline: "5 dias",
      paymentTerms: "Pix",
      deliveryAddress: null,
      notes: null,
      documentQuery: null,
    };

    await expect(createAgentDraft(context(rpc, from), draft, "018f7787-0d65-7f68-8176-74f8db53d509"))
      .resolves.toMatchObject({ status: "confirmed", number: "ORC-2026-000007" });
    expect(rpc).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledTimes(1);
  });
});
