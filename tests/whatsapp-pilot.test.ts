import { describe, expect, it } from "vitest";
import { assertPilotAuthorized, PILOT_AUTHORIZATION, PILOT_STEPS } from "../scripts/whatsapp-pilot-lib.mjs";

describe("WhatsApp pilot gate", () => {
  it("exige autorização explícita exata", () => {
    expect(() => assertPilotAuthorized(undefined)).toThrow("PILOT_EXPLICIT_AUTHORIZATION_REQUIRED");
    expect(() => assertPilotAuthorized("sim")).toThrow("PILOT_EXPLICIT_AUTHORIZATION_REQUIRED");
    expect(assertPilotAuthorized(PILOT_AUTHORIZATION)).toBe(true);
  });

  it("mantém as vinte etapas do piloto", () => {
    expect(PILOT_STEPS).toHaveLength(20);
    expect(new Set(PILOT_STEPS).size).toBe(20);
  });
});
