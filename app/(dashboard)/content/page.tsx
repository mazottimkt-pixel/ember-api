import Link from "next/link";
import { requireMembership } from "@/lib/auth/session";
import { EmptyState } from "@/components/ui";
export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const p = await searchParams,
    { supabase, organizationId } = await requireMembership();
  let query = supabase
    .from("content_projects")
    .select("id,type,objective,status,created_at,text_content")
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
  if (p.status) query = query.eq("status", p.status);
  if (p.q) query = query.ilike("objective", `%${p.q.replace(/[%_]/g, "")}%`);
  const { data = [] } = await query
    .order("created_at", { ascending: false })
    .limit(50);
  return (
    <>
      <div className="topline">
        <div>
          <span className="eyebrow">CONTEÚDO E MARKETING</span>
          <h1>Conteúdos</h1>
          <p className="muted">
            Projetos criativos em rascunho, revisão ou aprovados. Publicação não
            é automática.
          </p>
        </div>
        <div className="actions">
          <Link className="button secondary" href="/content/brand">
            Perfil da marca
          </Link>
          <Link className="button" href="/content/new">
            Criar conteúdo
          </Link>
        </div>
      </div>
      <section className="panel">
        <form className="toolbar">
          <input name="q" defaultValue={p.q} placeholder="Buscar objetivo…" />
          <select name="status" defaultValue={p.status ?? ""}>
            <option value="">Todos os estados</option>
            {[
              "draft",
              "generating",
              "ready_for_review",
              "approved",
              "archived",
              "failed",
              "cancelled",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <button className="button secondary">Filtrar</button>
        </form>
        {!data?.length ? (
          <EmptyState
            title="Nenhum conteúdo"
            description="Crie seu primeiro projeto de conteúdo."
          />
        ) : (
          <div className="operation-list">
            {data.map((project) => (
              <Link
                className="operation-card"
                href={`/content/${project.id}`}
                key={project.id}
              >
                <div>
                  <strong>{project.objective || project.type}</strong>
                  <div className="help">
                    {project.type} ·{" "}
                    {new Date(project.created_at).toLocaleDateString("pt-BR")}
                  </div>
                </div>
                <span className={`status ${project.status}`}>
                  {project.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
