import Link from "next/link";
import { requireMembership } from "@/lib/auth/session";
import { formatBRL } from "@/lib/domain/calculations";
import { EmptyState } from "@/components/ui";
export default async function Dashboard() {
  const { supabase, organization } = await requireMembership();
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const [{ count: quotes }, { count: orders }, { data: recent = [] }] =
    await Promise.all([
      supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("type", "quote")
        .gte("created_at", start.toISOString()),
      supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("type", "purchase_order")
        .gte("created_at", start.toISOString()),
      supabase
        .from("documents")
        .select("id,number,type,status,total,counterparty_snapshot")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
  const orgName = Array.isArray(organization)
    ? organization[0]?.name
    : (organization as { name?: string })?.name;
  return (
    <>
      <div className="topline">
        <div>
          <span className="eyebrow">{orgName ?? "PAINEL COMERCIAL"}</span>
          <h1>Seu comercial, organizado.</h1>
          <p className="muted">
            Crie, confirme e compartilhe documentos profissionais.
          </p>
        </div>
        <Link className="button" href="/documents/new">
          + Novo documento
        </Link>
      </div>
      <section className="cards">
        <div className="card">
          <span className="muted">Orçamentos no mês</span>
          <div className="metric">{quotes ?? 0}</div>
        </div>
        <div className="card">
          <span className="muted">Pedidos no mês</span>
          <div className="metric">{orders ?? 0}</div>
        </div>
        <div className="card">
          <span className="muted">Ações rápidas</span>
          <div style={{ marginTop: 12 }}>
            <Link href="/customers">Novo cliente →</Link>
          </div>
        </div>
      </section>
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="topline">
          <h2>Documentos recentes</h2>
          <Link href="/documents">Ver todos →</Link>
        </div>
        {!recent?.length ? (
          <EmptyState
            title="Nenhum documento ainda"
            description="Crie seu primeiro orçamento em poucos minutos."
            action={
              <Link className="button" href="/documents/new">
                Criar orçamento
              </Link>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Tipo</th>
                  <th>Destinatário</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <Link href={`/documents/${doc.id}`}>
                        <strong>{doc.number}</strong>
                      </Link>
                    </td>
                    <td>{doc.type === "quote" ? "Orçamento" : "Pedido"}</td>
                    <td>
                      {String(
                        (doc.counterparty_snapshot as { name?: string })
                          ?.name ?? "—",
                      )}
                    </td>
                    <td>{formatBRL(Number(doc.total))}</td>
                    <td>
                      <span className={`status ${doc.status}`}>
                        {doc.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
