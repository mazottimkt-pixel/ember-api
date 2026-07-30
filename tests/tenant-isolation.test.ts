import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
describe("tenant isolation migration", () => {
  const sql = readFileSync(
    "supabase/migrations/202607290001_initial_schema.sql",
    "utf8",
  );
  it("ativa RLS e usa membership por organização", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("public.is_org_member(organization_id)");
    expect(sql).toContain("public.has_org_role(organization_id");
  });
  it("deduplica mensagens oficiais", () =>
    expect(sql).toContain("whatsapp_message_id text not null unique"));
});
