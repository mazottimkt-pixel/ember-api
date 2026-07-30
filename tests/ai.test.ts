import { describe, expect, it } from "vitest";
import { extractValidated, type AIProvider } from "@/lib/ai/service";
describe("AI boundary", () => {
  it("valida saída e lista somente campos ausentes", async () => {
    const provider: AIProvider = {
      extract: async () => ({
        type: "quote",
        counterpartyName: "Alfa",
        items: [
          {
            description: "Manutenção",
            quantity: 12,
            unit: "un",
            unitPrice: 180,
            discount: 0,
          },
        ],
        shipping: 0,
        confidence: 0.9,
        ambiguities: [],
      }),
      transcribe: async () => "",
    };
    const result = await extractValidated(provider, "texto");
    expect(result.missing).toEqual([
      "prazo",
      "condição de pagamento",
      "validade",
    ]);
  });
  it("rejeita saída sem confiança", async () => {
    const provider: AIProvider = {
      extract: async () => ({}),
      transcribe: async () => "",
    };
    await expect(extractValidated(provider, "x")).rejects.toThrow();
  });
});
