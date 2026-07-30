import { describe, expect, it } from "vitest";
import { documentSchema } from "@/lib/domain/schemas";

const base = {
  counterpartyName: "Clínica Alfa",
  items: [
    {
      description: "Manutenção",
      quantity: 1,
      unit: "un",
      unitPrice: 100,
      discount: 0,
    },
  ],
  shipping: 0,
  deadline: "5 dias",
  paymentTerms: "À vista",
};
describe("documentSchema", () => {
  it("aceita orçamento completo", () =>
    expect(
      documentSchema.safeParse({
        ...base,
        type: "quote",
        validity: `${new Date().getFullYear() + 1}-12-31`,
      }).success,
    ).toBe(true));
  it("rejeita data inválida ou ano fora da faixa", () =>
    expect(
      documentSchema.safeParse({
        ...base,
        type: "quote",
        validity: "0277-07-07",
      }).success,
    ).toBe(false));
  it("exige endereço em pedido", () =>
    expect(
      documentSchema.safeParse({ ...base, type: "purchase_order" }).success,
    ).toBe(false));
});
