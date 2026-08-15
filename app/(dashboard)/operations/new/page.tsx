import { requireMembership } from "@/lib/auth/session";
import { OperationForm } from "@/components/operation-form";
export default async function NewOperation() {
  const { supabase, organizationId } = await requireMembership();
  const [
    { data: contacts = [] },
    { data: members = [] },
    { data: ops = [] },
    { data: templates = [] },
  ] = await Promise.all([
    supabase
      .from("business_contacts")
      .select("id,legal_name")
      .eq("organization_id", organizationId)
      .eq("is_customer", true)
      .eq("active", true)
      .is("deleted_at", null)
      .order("legal_name"),
    supabase
      .from("organization_members")
      .select("user_id,profiles(full_name)")
      .eq("organization_id", organizationId),
    supabase
      .from("operational_documents")
      .select("id,number,title,type")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .in("type", ["service_order", "checklist"])
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("checklist_templates")
      .select("id,name,version")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .is("deleted_at", null)
      .order("name"),
  ]);
  return (
    <>
      <div className="topline">
        <div>
          <span className="eyebrow">NOVA OPERAÇÃO</span>
          <h1>Criar operação</h1>
          <p className="muted">
            Comece com uma ordem, checklist independente ou relatório vinculado.
          </p>
        </div>
      </div>
      <OperationForm
        requestId={crypto.randomUUID()}
        contacts={(contacts ?? []).map((c) => ({
          id: c.id,
          label: c.legal_name,
        }))}
        people={(members ?? []).map((m) => ({
          id: m.user_id,
          label:
            (m.profiles as unknown as { full_name: string })?.full_name ??
            "Usuário",
        }))}
        orders={(ops ?? [])
          .filter((o) => o.type === "service_order")
          .map((o) => ({ id: o.id, label: `${o.number} · ${o.title}` }))}
        checklists={(ops ?? [])
          .filter((o) => o.type === "checklist")
          .map((o) => ({ id: o.id, label: `${o.number} · ${o.title}` }))}
        templates={(templates ?? []).map((template) => ({
          id: template.id,
          label: `${template.name} · v${template.version}`,
        }))}
      />
    </>
  );
}
