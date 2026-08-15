import Link from "next/link";
import { requireMembership } from "@/lib/auth/session";
import { formatBRL } from "@/lib/domain/calculations";
import { Pagination } from "@/components/list-toolbar";
import { ConfirmButton, EmptyState, SubmitButton } from "@/components/ui";
import { archiveDocument, restoreDocument } from "../document-lifecycle-actions";
import { dashboardPeriodStart, parseDashboardPeriod } from "@/lib/dashboard/metrics";
import { documentTypeLabel } from "@/lib/documents/registry";

type Search = { q?: string; page?: string; sort?: string; deleted?: string; type?: string; status?: string; period?: string };
const statuses = ["draft", "awaiting_confirmation", "confirmed", "generated", "sent", "cancelled"];

export default async function Documents({ searchParams }: { searchParams: Promise<Search> }) {
  const p = await searchParams, page = Math.max(1, Number(p.page) || 1), size = 10;
  const { supabase, organizationId } = await requireMembership();
  let query = supabase.from("documents").select("id,number,type,status,total,counterparty_snapshot,created_at,deleted_at", { count: "exact" }).eq("organization_id", organizationId);
  query = p.deleted ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);
  if (p.q) { const q = p.q.replace(/[%_,]/g, ""); query = query.or(`number.ilike.%${q}%,counterparty_snapshot->>name.ilike.%${q}%`); }
  if (p.type === "quote" || p.type === "purchase_order") query = query.eq("type", p.type);
  if (p.status && statuses.includes(p.status)) query = query.eq("status", p.status);
  if (p.period) query = query.gte("created_at", dashboardPeriodStart(parseDashboardPeriod(p.period)));
  query = p.sort === "oldest" ? query.order("created_at") : p.sort === "value" ? query.order("total", { ascending: false }) : query.order("created_at", { ascending: false });
  const { data: result, count = 0 } = await query.range((page - 1) * size, page * size - 1);
  const data = result ?? [];
  return <><div className="topline"><div><span className="eyebrow">VENDAS E COMPRAS</span><h1>Documentos</h1><p className="muted">Acompanhe rascunhos, confirmações e PDFs.</p></div><Link className="button" href="/documents/new">Novo documento</Link></div>
    <section className="panel"><form className="toolbar document-toolbar" method="get" role="search"><input name="q" defaultValue={p.q} placeholder="Número ou destinatário…" /><select name="type" defaultValue={p.type ?? ""}><option value="">Todos os tipos</option><option value="quote">Orçamento</option><option value="purchase_order">Pedido de compra</option></select><select name="status" defaultValue={p.status ?? ""}><option value="">Todos os status</option>{statuses.map(status => <option key={status}>{status}</option>)}</select><select name="period" defaultValue={p.period ?? ""}><option value="">Todo o período</option><option value="7d">7 dias</option><option value="30d">30 dias</option><option value="month">Mês atual</option></select><select name="sort" defaultValue={p.sort ?? "newest"}><option value="newest">Mais recentes</option><option value="oldest">Mais antigos</option><option value="value">Maior valor</option></select><label className="check"><input type="checkbox" name="deleted" value="1" defaultChecked={Boolean(p.deleted)} /> Excluídos</label><button className="button secondary">Aplicar</button></form>
    {!data.length ? <EmptyState title="Nenhum documento encontrado" description="Crie um orçamento ou ajuste os filtros." action={<Link className="button" href="/documents/new">Criar documento</Link>} /> : <div className="table-wrap"><table className="table"><thead><tr><th>Número</th><th>Tipo</th><th>Destinatário</th><th>Data</th><th>Total</th><th>Status</th><th>Ações</th></tr></thead><tbody>{data.map(doc => <tr key={doc.id}><td><Link href={`/documents/${doc.id}`}><strong>{doc.number}</strong></Link></td><td>{documentTypeLabel(doc.type)}</td><td>{String((doc.counterparty_snapshot as { name?: string })?.name ?? "—")}</td><td>{new Intl.DateTimeFormat("pt-BR").format(new Date(doc.created_at))}</td><td>{formatBRL(Number(doc.total))}</td><td><span className={`status ${doc.status}`}>{doc.status}</span></td><td>{doc.deleted_at ? <form action={restoreDocument}><input type="hidden" name="id" value={doc.id}/><SubmitButton className="button secondary">Restaurar</SubmitButton></form> : doc.status === "draft" ? <form action={archiveDocument}><input type="hidden" name="id" value={doc.id}/><ConfirmButton message={`Excluir o rascunho ${doc.number}?`}>Excluir</ConfirmButton></form> : <Link href={`/documents/${doc.id}`}>Abrir →</Link>}</td></tr>)}</tbody></table></div>}
    <Pagination page={page} hasMore={page * size < (count ?? 0)} searchParams={p} /></section></>;
}
