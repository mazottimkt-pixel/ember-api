import { describe, expect, it } from "vitest";
import { formatDateBR, isValidTaxId } from "@/lib/domain/brazil";

describe("validações brasileiras", () => {
  it("valida CPF e CNPJ", () => {
    expect(isValidTaxId("055.018.931-93")).toBe(true);
    expect(isValidTaxId("11.444.777/0001-61")).toBe(true);
    expect(isValidTaxId("111.111.111-11")).toBe(false);
  });
  it("formata data ISO sem alterar o dia por fuso", () =>
    expect(formatDateBR("2027-07-07")).toBe("07/07/2027"));
});
