import { describe, expect, it } from "vitest";
import { buildSwitchPlan, digits, maskId } from "../scripts/whatsapp-switch-lib.mjs";

describe("WhatsApp channel switch", () => {
  it("valida identificadores sem revelar valor completo", () => {
    expect(digits("123456789", "ID")).toBe("123456789");
    expect(() => digits("+55 11", "ID")).toThrow("ID_INVALID");
    expect(maskId("1234567890")).toBe("1234***7890");
  });

  it("preserva referência de rollback ao trocar", () => {
    expect(buildSwitchPlan({ id: "old", phoneNumberId: "111111111", businessAccountId: "222222222" }, { phoneNumberId: "333333333", businessAccountId: "222222222" })).toMatchObject({ operation: "switch", rollbackAvailable: true });
  });
});
