import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const read = (path: string) => readFileSync(path, "utf8");
describe("phase 1 UI wiring", () => {
  it("mounts the central Lume drawer and keeps explicit confirmation", () => {
    expect(read("app/(dashboard)/layout.tsx")).toContain("<LumeCentral />");
    const central = read("components/lume-central.tsx");
    expect(central).toContain('state === "awaiting_confirmation"');
    expect(central).toContain('send("Confirmar", "confirm")');
    expect(central).toContain("/api/agent");
  });
  it("offers real document filters and organization-scoped queries", () => {
    const docs = read("app/(dashboard)/documents/page.tsx");
    expect(docs).toContain('.eq("organization_id", organizationId)');
    expect(docs).toContain('name="period"');
    expect(docs).toContain('name="status"');
  });
});
