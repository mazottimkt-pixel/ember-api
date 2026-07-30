import { describe, expect, it } from "vitest";
import { formatDocumentNumber } from "@/lib/domain/document-number";
describe("formatDocumentNumber", () => {
  it("numera por tipo e ano", () => {
    expect(formatDocumentNumber("quote", 42, 2026)).toBe("ORC-2026-000042");
    expect(formatDocumentNumber("purchase_order", 2, 2026)).toBe(
      "PC-2026-000002",
    );
  });
});
