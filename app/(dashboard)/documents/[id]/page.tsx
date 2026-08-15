import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/auth/session";
import { formatBRL } from "@/lib/domain/calculations";
import { duplicateDocument } from "../../crud-actions";
import { confirmDocument } from "../../document-actions";
import { ConfirmButton, SubmitButton } from "@/components/ui";
const eventLabels: Record<string, string> = {
  "draft.created": "Rascunho criado",
  "draft.updated": "Rascunho atualizado",
  "draft.duplicated": "Documento duplicado",
  "document.confirmed": "Documento confirmado",
  "pdf.generated": "PDF gerado",
  "draft.archived": "Rascunho excluído",
  "draft.restored": "Rascunho restaurado",
};
export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; confirmed?: string }>;
}) {
  const { id } = await params,
    query = await searchParams;
  const { supabase } = await requireMembership();
  const { data: doc } = await supabase
    .from("documents")
    .select("*,document_items(*),document_events(*)")
    .eq("id", id)
    .single();
  if (!doc) notFound();
  const party = doc.counterparty_snapshot as { name?: string; tax_id?: string };
  return (
    <>
      {query.saved && (
        <p className="success" role="status">
          Rascunho salvo com sucesso.
        </p>
      )}
      {query.confirmed && (
        <p className="success" role="status">
          Documento confirmado. O PDF já pode ser baixado.
        </p>
      )}
      <div className="topline">
        <div>
          <span className="eyebrow">
            {doc.type === "quote" ? "ORÇAMENTO" : "PEDIDO DE COMPRA"}
          </span>
          <h1>{doc.number}</h1>
          <p className="muted">
            {party.name} {party.tax_id && `• ${party.tax_id}`}
          </p>
        </div>
        <div className="actions">
          {doc.type==="quote"&&doc.confirmed_at&&["confirmed","generated","sent"].includes(doc.status)&&<Link className="button secondary" href={`/operations/from-quote/${id}`}>Criar ordem de serviço</Link>}
          {doc.status === "draft" && (
            <Link className="button secondary" href={`/documents/${id}/edit`}>
              Editar
            </Link>
          )}
          <form action={duplicateDocument}>
            <input type="hidden" name="id" value={id} />
            <SubmitButton className="button secondary" pending="Duplicando…">
              Duplicar
            </SubmitButton>
          </form>
          {doc.status === "draft" && (
            <form action={confirmDocument}>
              <input type="hidden" name="id" value={id} />
              <ConfirmButton
                className="button"
                message="Confirmar este documento? Depois disso ele não poderá ser editado."
              >
                Confirmar
              </ConfirmButton>
            </form>
          )}
        </div>
      </div>
      <section className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Qtd.</th>
                <th>Un.</th>
                <th>Unitário</th>
                <th>Desconto</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {doc.document_items
                ?.sort(
                  (a: { position: number }, b: { position: number }) =>
                    a.position - b.position,
                )
                .map(
                  (item: {
                    id: string;
                    description: string;
                    quantity: number;
                    unit: string;
                    unit_price: number;
                    discount: number;
                    line_total: number;
                  }) => (
                    <tr key={item.id}>
                      <td>{item.description}</td>
                      <td>{Number(item.quantity)}</td>
                      <td>{item.unit}</td>
                      <td>{formatBRL(Number(item.unit_price))}</td>
                      <td>{formatBRL(Number(item.discount))}</td>
                      <td>
                        <strong>{formatBRL(Number(item.line_total))}</strong>
                      </td>
                    </tr>
                  ),
                )}
            </tbody>
          </table>
        </div>
        <div className="cards" style={{ marginTop: 18 }}>
          <div>
            <span className="muted">Subtotal</span>
            <strong>{formatBRL(Number(doc.subtotal))}</strong>
          </div>
          <div>
            <span className="muted">Descontos</span>
            <strong>{formatBRL(Number(doc.discount))}</strong>
          </div>
          <div>
            <span className="muted">Total</span>
            <strong>{formatBRL(Number(doc.total))}</strong>
          </div>
        </div>
        <p>
          <span className={`status ${doc.status}`}>{doc.status}</span>
        </p>
        {doc.status !== "draft" && (
          <a className="button" href={`/api/documents/${id}/pdf`} download={`${doc.number}.pdf`}>
            Baixar PDF
          </a>
        )}
      </section>
      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Histórico</h2>
        <div className="demo-list">
          {doc.document_events
            ?.sort((a: { created_at: string }, b: { created_at: string }) =>
              a.created_at.localeCompare(b.created_at),
            )
            .map(
              (event: {
                id: string;
                event_type: string;
                created_at: string;
              }) => (
                <div className="demo-item" key={event.id}>
                  <b>✓</b>
                  <div>
                    <strong>
                      {eventLabels[event.event_type] ?? event.event_type}
                    </strong>
                    <div className="help">
                      {new Date(event.created_at).toLocaleString("pt-BR")}
                    </div>
                  </div>
                </div>
              ),
            )}
        </div>
      </section>
    </>
  );
}
