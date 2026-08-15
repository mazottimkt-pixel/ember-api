import Link from "next/link";
import { requireMembership } from "@/lib/auth/session";
import { formatBRL } from "@/lib/domain/calculations";
import { EmptyState } from "@/components/ui";
import { loadDashboardData, parseDashboardPeriod } from "@/lib/dashboard/metrics";
import { documentTypeLabel } from "@/lib/documents/registry";

const periodLabels = { "7d": "Últimos 7 dias", "30d": "Últimos 30 dias", month: "Mês atual" } as const;
export default async function Dashboard({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const params = await searchParams;
  const period = parseDashboardPeriod(params.period);
  const { supabase, organizationId, organization } = await requireMembership();
  const data = await loadDashboardData(supabase, organizationId, period);
  const metrics = data.metrics;
  const orgName = Array.isArray(organization) ? organization[0]?.name : (organization as { name?: string })?.name;
  return <>
    <div className="topline"><div><span className="eyebrow">{orgName ?? "PAINEL DA EMPRESA"}</span><h1>Visão gerencial</h1><p className="muted">Indicadores reais da operação no período selecionado.</p></div><Link className="button" href="/documents/new">Criar documento</Link></div>
    <nav className="period-filter" aria-label="Período dos indicadores">{Object.entries(periodLabels).map(([value,label]) => <Link className={`button secondary ${period === value ? "selected" : ""}`} href={`/dashboard?period=${value}`} key={value}>{label}</Link>)}</nav>
    <section className="metric-grid" aria-label="Indicadores">
      <Metric label="Orçamentos criados" value={String(metrics.quoteCount)} empty="Nenhum orçamento criado neste período." />
      <Metric label="Valor dos orçamentos" value={formatBRL(metrics.quoteTotal)} />
      <Metric label="Valor confirmado" value={formatBRL(metrics.confirmedQuoteValue)} detail={`${metrics.confirmedQuoteCount} confirmado(s)`} />
      <Metric label="Valor em negociação" value={formatBRL(metrics.negotiationValue)} detail="Rascunhos e aguardando confirmação" />
      <Metric label="Pedidos de compra" value={String(metrics.purchaseOrderCount)} detail={formatBRL(metrics.purchaseOrderTotal)} />
      <Metric label="Pedidos pendentes" value={String(metrics.pendingPurchaseOrderCount)} detail="Ainda não enviados ou cancelados" />
    </section>
    {data.operationalMetrics && <section className="panel" style={{marginTop:16}}><div className="topline compact"><div><h2>Operações</h2><p className="muted">Indicadores reais do período selecionado.</p></div><Link href="/operations">Abrir operações →</Link></div><div className="metric-grid"><Metric label="Ordens criadas" value={String(data.operationalMetrics.orderCount)}/><Metric label="Em andamento" value={String(data.operationalMetrics.inProgress)}/><Metric label="Agendadas" value={String(data.operationalMetrics.scheduled)}/><Metric label="Concluídas" value={String(data.operationalMetrics.completed)}/><Metric label="Atrasadas" value={String(data.operationalMetrics.overdue)}/><Metric label="Tempo médio" value={data.operationalMetrics.averageCompletionHours===null?"Dados insuficientes":`${data.operationalMetrics.averageCompletionHours.toFixed(1)} h`}/><Metric label="Checklists em andamento" value={String(data.operationalMetrics.checklistsInProgress)}/><Metric label="Checklists com problemas" value={String(data.operationalMetrics.checklistsWithIssues)}/><Metric label="Relatórios aguardando aceite" value={String(data.operationalMetrics.reportsAwaitingAcceptance)}/></div></section>}
    <section className="quick-actions panel"><h2>Ações rápidas</h2><div className="actions">
      <Link className="button" href="/documents/new?type=quote">Criar orçamento</Link><Link className="button secondary" href="/documents/new?type=purchase_order">Criar pedido</Link>
      <button className="button secondary" type="button" data-open-lume>Falar com a Lume</button><Link className="button secondary" href="/documents">Consultar documentos</Link>
      <Link className="button secondary" href="/contacts?role=customer">Cadastrar cliente</Link><Link className="button secondary" href="/contacts?role=supplier">Cadastrar fornecedor</Link><Link className="button secondary" href="/catalog">Cadastrar produto ou serviço</Link>
    </div></section>
    <div className="dashboard-columns">
      <section className="panel"><div className="topline compact"><h2>Documentos recentes</h2><Link href="/documents">Ver todos →</Link></div>
        {!data.recentDocuments.length ? <EmptyState title="Nenhum documento ainda" description="Crie seu primeiro orçamento com a Lume." /> : <div className="responsive-list">{data.recentDocuments.map((doc) => <article className="responsive-row" key={doc.id}><div><Link href={`/documents/${doc.id}`}><strong>{doc.number}</strong></Link><div className="help">{documentTypeLabel(doc.type)} · {String((doc.counterparty_snapshot as { name?: string })?.name ?? "Sem contraparte")}</div></div><div><strong>{formatBRL(Number(doc.total))}</strong><div><span className={`status ${doc.status}`}>{doc.status}</span></div></div></article>)}</div>}
      </section>
      <section className="panel"><h2>Exigem atenção</h2>{!metrics.attention.length ? <p className="muted">Nenhum documento aguardando confirmação neste período.</p> : <div className="responsive-list">{metrics.attention.slice(0,5).map((doc) => <article className="responsive-row" key={doc.id}><Link href={`/documents/${doc.id}`}><strong>{doc.number}</strong><div className="help">Aguardando confirmação</div></Link><strong>{formatBRL(Number(doc.total))}</strong></article>)}</div>}
        <h2 style={{marginTop:24}}>Contatos recentes</h2>{!data.recentContacts.length ? <p className="muted">Nenhum contato cadastrado.</p> : <ul className="clean-list">{data.recentContacts.map((contact) => <li key={contact.id}>{contact.legal_name}<span className="help">{contact.is_customer && contact.is_supplier ? "Cliente e fornecedor" : contact.is_supplier ? "Fornecedor" : "Cliente"}</span></li>)}</ul>}</section>
    </div>
    <section className="panel" style={{marginTop:16}}><h2>Orçamentos por status</h2><div className="status-distribution">{Object.entries(metrics.quoteByStatus).map(([status,count]) => <div key={status}><span className={`status ${status}`}>{status}</span><strong>{count}</strong></div>)}</div></section>
  </>;
}
function Metric({ label, value, detail, empty }: { label: string; value: string; detail?: string; empty?: string }) { return <article className="card"><span className="muted">{label}</span><div className="metric">{value}</div>{detail && <div className="help">{detail}</div>}{empty && value === "0" && <div className="help">{empty}</div>}</article>; }
