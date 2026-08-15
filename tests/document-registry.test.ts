import { describe, expect, it } from "vitest";
import { documentRegistry, enabledDocumentTypes, purchaseRequestLifecycle } from "@/lib/documents/registry";

describe("document registry", () => {
  it("enables stable commercial and completed operational flows", () => {
    expect(enabledDocumentTypes().map((entry) => entry.type)).toEqual(["quote", "purchase_order", "service_order", "service_report", "checklist"]);
    expect(enabledDocumentTypes().every((entry) => entry.requiresExplicitConfirmation && entry.renderer)).toBe(true);
  });
  it("registers operational states, fields, actions and renderers",()=>{for(const type of ["service_order","checklist","service_report"] as const){expect(documentRegistry[type].availability).toBe("enabled");expect(documentRegistry[type].requiredFields.length).toBeGreaterThan(0);expect(documentRegistry[type].renderer).toBe("generateOperationalPdf");expect(documentRegistry[type].supportedActions).toContain("generate_pdf");}});
  it("keeps future types visible but unavailable", () => {
    expect(documentRegistry.contract.availability).toBe("planned");
    expect(documentRegistry.receipt.supportedActions).toEqual([]);
    expect(purchaseRequestLifecycle.transitions.approved).toContain("ordered");
  });
});
