import Link from "next/link";
import { requireMembership } from "@/lib/auth/session";
import { formatBRL } from "@/lib/domain/calculations";
import { ListToolbar, Pagination } from "@/components/list-toolbar";
import { ConfirmButton, EmptyState, SubmitButton } from "@/components/ui";
import {
  archiveDocument,
  restoreDocument,
} from "../document-lifecycle-actions";
export default async function Documents({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    sort?: string;
    deleted?: string;
  }>;
}) {
  const p = await searchParams,
    page = Math.max(1, Number(p.page) || 1),
    size = 10;
  const { supabase } = await requireMembership();
  let query = supabase
    .from("documents")
    .select(
      "id,number,type,status,total,counterparty_snapshot,created_at,deleted_at",
      { count: "exact" },
    );
  query = p.deleted
    ? query.not("deleted_at", "is", null)
    : query.is("deleted_at", null);
  if (p.q) query = query.ilike("number", `%${p.q.replace(/[%_]/g, "")}%`);
  query =
    p.sort === "name"
      ? query.order("number")
      : query.order("created_at", { ascending: false });
  const { data = [], count = 0 } = await query.range(
    (page - 1) * size,
    page * size - 1,
  );
  return (
    <>
      <div className="topline">
        <div>
          <span className="eyebrow">VENDAS E COMPRAS</span>
          <h1>Documentos</h1>
          <p className="muted">Acompanhe rascunhos, confirmações e PDFs.</p>
        </div>
        <Link className="button" href="/documents/new">
          Novo documento
        </Link>
      </div>
      <section className="panel">
        <ListToolbar
          query={p.q}
          showDeleted={Boolean(p.deleted)}
          placeholder="Buscar pelo número…"
        />
        {!data?.length ? (
          <EmptyState
            title="Nenhum documento encontrado"
            description="Crie um orçamento ou ajuste os filtros."
            action={
              <Link className="button" href="/documents/new">
                Criar documento
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
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {data.map((doc) => (
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
                    <td>
                      {doc.deleted_at ? (
                        <form action={restoreDocument}>
                          <input type="hidden" name="id" value={doc.id} />
                          <SubmitButton className="button secondary">
                            Restaurar
                          </SubmitButton>
                        </form>
                      ) : doc.status === "draft" ? (
                        <form action={archiveDocument}>
                          <input type="hidden" name="id" value={doc.id} />
                          <ConfirmButton
                            message={`Excluir o rascunho ${doc.number}?`}
                          >
                            Excluir
                          </ConfirmButton>
                        </form>
                      ) : (
                        <Link href={`/documents/${doc.id}`}>Abrir →</Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} hasMore={page * size < (count ?? 0)} />
      </section>
    </>
  );
}
