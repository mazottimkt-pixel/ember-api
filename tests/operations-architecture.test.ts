import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  checklistItemStates,
  checklistStates,
  reportStates,
  serviceOrderStates,
  serviceOrderTransitions,
} from "@/lib/operations/domain";
import { operationalChannelPolicy } from "@/lib/operations/channel-policy";
const read = (path: string) => readFileSync(path, "utf8");
describe("operational architecture", () => {
  it.each(serviceOrderStates)("declares service order state %s", (state) =>
    expect(serviceOrderStates).toContain(state),
  );
  it.each(checklistStates)("declares checklist state %s", (state) =>
    expect(checklistStates).toContain(state),
  );
  it.each(checklistItemStates)("declares checklist item state %s", (state) =>
    expect(checklistItemStates).toContain(state),
  );
  it.each(reportStates)("declares report state %s", (state) =>
    expect(reportStates).toContain(state),
  );
  it("never allows draft to complete", () =>
    expect(serviceOrderTransitions.draft).not.toContain("completed"));
  it("keeps WhatsApp operational flows disabled", () => {
    expect(operationalChannelPolicy.whatsapp.enabled).toBe(false);
    expect(operationalChannelPolicy.panel.enabled).toBe(true);
  });
  it("creates additive tables, indexes, RLS and private evidence storage", () => {
    const sql = read("supabase/migrations/202608050001_operational_module.sql");
    for (const table of [
      "operational_documents",
      "operational_checklist_items",
      "checklist_templates",
      "operational_attachments",
      "operational_events",
    ])
      expect(sql).toContain(`public.${table}`);
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("false,10485760");
    expect(sql).toContain("next_operational_number");
  });
  it("adds database transition and immutability guards", () => {
    const sql = read("supabase/migrations/202608050002_operational_guards.sql");
    expect(sql).toContain("invalid operational transition");
    expect(sql).toContain("terminal operational content is immutable");
    expect(sql).toContain("checklist is not editable");
  });
  it("wires operational pages without WhatsApp changes", () => {
    expect(read("components/sidebar.tsx")).toContain('"/operations"');
    expect(read("app/(dashboard)/operations/page.tsx")).toContain(
      'eq("organization_id", organizationId)',
    );
    expect(read("components/lume-central.tsx")).toContain(
      "Consultar operações",
    );
    expect(read("lib/whatsapp/lume-messages.ts")).not.toContain(
      "Criar ordem de serviço",
    );
  });
});
