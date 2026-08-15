import Link from "next/link";
import { requireMembership } from "@/lib/auth/session";
import { Pagination } from "@/components/list-toolbar";
import { EmptyState } from "@/components/ui";
import { documentTypeLabel } from "@/lib/documents/registry";
type Search = {
  q?: string;
  type?: string;
  status?: string;
  responsible?: string;
  page?: string;
};
export default async function Operations({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const p = await searchParams,
    page = Math.max(1, Number(p.page) || 1),
    size = 12;
  const { supabase, organizationId } = await requireMembership();
  let query = supabase
    .from("operational_documents")
    .select(
      "id,number,type,modality,title,status,priority,scheduled_at,due_at,counterparty_snapshot,responsible_id,profiles!operational_documents_responsible_id_fkey(full_name)",
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
  if (p.q) {
    const q = p.q.replace(/[%_,]/g, "");
    query = query.or(`number.ilike.%${q}%,title.ilike.%${q}%`);
  }
  if (["service_order", "checklist", "service_report"].includes(p.type ?? ""))
    query = query.eq("type", p.type);
  if (p.status) query = query.eq("status", p.status);
  if (p.responsible) query = query.eq("responsible_id", p.responsible);
  const [{ data: result, count = 0 }, { data: people = [] }] =
    await Promise.all([
      query
        .order("created_at", { ascending: false })
        .range((page - 1) * size, page * size - 1),
      supabase
        .from("organization_members")
        .select("user_id,profiles(full_name)")
        .eq("organization_id", organizationId),
    ]);
  const data = result ?? [];
  return (
    <>
      <div className="topline">
        <div>
          <span className="eyebrow">OPERAÇÕES</span>
          <h1>Operações de campo</h1>
          <p className="muted">
            Ordens, checklists e relatórios conectados em um único ciclo.
          </p>
        </div>
        <Link className="button" href="/operations/new">
          Nova operação
        </Link>
      </div>
      <section className="metric-grid">
        <Card
          label="Ordens em andamento"
          value={
            data.filter(
              (d) => d.type === "service_order" && d.status === "in_progress",
            ).length
          }
        />
        <Card
          label="Checklists pendentes"
          value={
            data.filter(
              (d) =>
                d.type === "checklist" &&
                !["completed", "completed_with_issues", "cancelled"].includes(
                  d.status,
                ),
            ).length
          }
        />
        <Card
          label="Aceites pendentes"
          value={
            data.filter(
              (d) =>
                d.type === "service_report" &&
                d.status === "ready_for_acceptance",
            ).length
          }
        />
      </section>
      <section className="panel">
        <form className="toolbar" method="get">
          <input name="q" defaultValue={p.q} placeholder="Número ou título…" />
          <select name="type" defaultValue={p.type ?? ""}>
            <option value="">Todos os tipos</option>
            <option value="service_order">Ordens</option>
            <option value="checklist">Checklists</option>
            <option value="service_report">Relatórios</option>
          </select>
          <select name="status" defaultValue={p.status ?? ""}>
            <option value="">Todos os status</option>
            {[
              "draft",
              "pending_approval",
              "approved",
              "scheduled",
              "in_progress",
              "paused",
              "under_review",
              "ready_for_acceptance",
              "accepted",
              "completed",
              "completed_with_issues",
              "cancelled",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select name="responsible" defaultValue={p.responsible ?? ""}>
            <option value="">Todos os responsáveis</option>
            {people?.map((row) => (
              <option value={row.user_id} key={row.user_id}>
                {(row.profiles as unknown as { full_name: string })?.full_name}
              </option>
            ))}
          </select>
          <button className="button secondary">Filtrar</button>
        </form>
        {!data.length ? (
          <EmptyState
            title="Nenhuma operação encontrada"
            description="Crie uma ordem, checklist ou relatório para iniciar."
          />
        ) : (
          <div className="operation-list">
            {data.map((doc) => (
              <Link
                className="operation-card"
                href={`/operations/${doc.id}`}
                key={doc.id}
              >
                <div>
                  <strong>
                    {doc.number} · {doc.title}
                  </strong>
                  <div className="help">
                    {documentTypeLabel(doc.type)} ·{" "}
                    {String(
                      (doc.counterparty_snapshot as { name?: string })?.name ??
                        "Sem cliente",
                    )}
                  </div>
                </div>
                <div>
                  <span className={`status ${doc.status}`}>{doc.status}</span>
                  <div className="help">
                    {(doc.profiles as unknown as { full_name?: string })
                      ?.full_name ?? "Sem responsável"}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
        <Pagination
          page={page}
          hasMore={page * size < (count ?? 0)}
          searchParams={p}
        />
      </section>
    </>
  );
}
function Card({ label, value }: { label: string; value: number }) {
  return (
    <article className="card">
      <span className="muted">{label}</span>
      <div className="metric">{value}</div>
    </article>
  );
}
