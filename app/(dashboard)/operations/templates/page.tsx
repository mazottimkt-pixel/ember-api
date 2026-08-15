import Link from "next/link";
import { requireMembership } from "@/lib/auth/session";
import { saveChecklistTemplate } from "../actions";
import { SubmitButton } from "@/components/ui";
export default async function ChecklistTemplates() {
  const { supabase, organizationId } = await requireMembership();
  const { data = [] } = await supabase
    .from("checklist_templates")
    .select("id,name,description,version,items_snapshot,active,created_at")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  return (
    <>
      <div className="topline">
        <div>
          <span className="eyebrow">MODELOS OPERACIONAIS</span>
          <h1>Modelos de checklist</h1>
          <p className="muted">
            Cada alteração cria uma nova versão; checklists existentes preservam
            seus itens.
          </p>
        </div>
        <Link href="/operations" className="button secondary">
          Voltar
        </Link>
      </div>
      <form className="panel form-grid" action={saveChecklistTemplate}>
        <label className="field">
          Nome do modelo
          <input name="name" required minLength={3} />
        </label>
        <label className="field full">
          Itens obrigatórios, um por linha
          <textarea name="items" rows={7} required />
        </label>
        <SubmitButton>Salvar nova versão</SubmitButton>
      </form>
      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Versões disponíveis</h2>
        <div className="operation-list">
          {data?.map((template) => (
            <article className="operation-card" key={template.id}>
              <div>
                <strong>
                  {template.name} · v{template.version}
                </strong>
                <div className="help">
                  {Array.isArray(template.items_snapshot)
                    ? template.items_snapshot.length
                    : 0}{" "}
                  item(ns)
                </div>
              </div>
              <span
                className={`status ${template.active ? "confirmed" : "cancelled"}`}
              >
                {template.active ? "Ativo" : "Inativo"}
              </span>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
