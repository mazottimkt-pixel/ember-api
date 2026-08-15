import { ContactForm } from "@/components/contact-form";
import { ListToolbar, Pagination } from "@/components/list-toolbar";
import { ConfirmButton, EmptyState, SubmitButton } from "@/components/ui";
import { requireMembership } from "@/lib/auth/session";
import { setContactDeleted } from "./actions";

type Search = { q?: string; page?: string; sort?: string; deleted?: string; role?: string };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const size = 10;
  const { supabase, organizationId } = await requireMembership();
  let query = supabase.from("business_contacts").select("*", { count: "exact" }).eq("organization_id", organizationId);
  query = params.deleted ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);
  if (params.role === "customer") query = query.eq("is_customer", true);
  if (params.role === "supplier") query = query.eq("is_supplier", true);
  if (params.role === "both") query = query.eq("is_customer", true).eq("is_supplier", true);
  if (params.q) {
    const q = params.q.replace(/[%_,]/g, "");
    query = query.or(`legal_name.ilike.%${q}%,trade_name.ilike.%${q}%,tax_id.ilike.%${q}%`);
  }
  query = params.sort === "newest" ? query.order("created_at", { ascending: false }) : query.order("legal_name");
  const { data, count = 0 } = await query.range((page - 1) * size, page * size - 1);
  const contacts = data ?? [];
  const ids = contacts.map((contact) => contact.id);
  const { data: related = [] } = ids.length ? await supabase.from("documents").select("counterparty_id,total,created_at").eq("organization_id", organizationId).is("deleted_at", null).in("counterparty_id", ids) : { data: [] };
  const activity = new Map<string, { count: number; total: number; latest: string }>();
  related?.forEach((doc) => { if (!doc.counterparty_id) return; const current = activity.get(doc.counterparty_id); activity.set(doc.counterparty_id, { count: (current?.count ?? 0) + 1, total: (current?.total ?? 0) + Number(doc.total), latest: !current || doc.created_at > current.latest ? doc.created_at : current.latest }); });
  return (
    <>
      <div className="topline"><div><span className="eyebrow">RELACIONAMENTOS</span><h1>Cadastros</h1><p className="muted">Uma pessoa ou empresa pode ser cliente, fornecedor ou ambos.</p></div></div>
      <section className="panel"><h2>Novo cadastro</h2><ContactForm /></section>
      <section className="panel" style={{ marginTop: 16 }}>
        <ListToolbar query={params.q} showDeleted={Boolean(params.deleted)} />
        <form className="role-filters" method="get">
          <input type="hidden" name="q" value={params.q ?? ""} />
          {[['','Todos'],['customer','Clientes'],['supplier','Fornecedores'],['both','Clientes e fornecedores']].map(([value,label]) => <button className={`button secondary ${params.role === value || (!params.role && !value) ? 'selected' : ''}`} name="role" value={value} key={value}>{label}</button>)}
        </form>
        {!contacts.length ? <EmptyState title="Nenhum cadastro encontrado" description="Adicione um contato ou ajuste os filtros." /> : (
          <div className="contact-list">{contacts.map((contact) => (
            <article className="contact-card" key={contact.id}>
              <div><strong>{contact.legal_name}</strong>{contact.trade_name && <div className="help">{contact.trade_name}</div>}<div className="help">{contact.tax_id || "Sem documento"} · {contact.phone || contact.email || "Sem contato"}</div><div className="role-badges">{contact.is_customer && <span className="status">Cliente</span>}{contact.is_supplier && <span className="status">Fornecedor</span>}<span className={`status ${contact.active ? "confirmed" : "cancelled"}`}>{contact.active ? "Ativo" : "Inativo"}</span></div>{activity.get(contact.id) ? <div className="help">{activity.get(contact.id)!.count} documento(s) · {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(activity.get(contact.id)!.total)} · última atividade {new Intl.DateTimeFormat("pt-BR").format(new Date(activity.get(contact.id)!.latest))}</div> : <div className="help">Sem documentos vinculados</div>}</div>
              <div className="actions">
                {!contact.deleted_at && <details><summary className="button secondary">Editar</summary><div className="inline-editor"><ContactForm initial={contact} /></div></details>}
                <form action={setContactDeleted}><input type="hidden" name="id" value={contact.id} /><input type="hidden" name="restore" value={contact.deleted_at ? "true" : "false"} />{contact.deleted_at ? <SubmitButton className="button secondary">Restaurar</SubmitButton> : <ConfirmButton message={`Excluir ${contact.legal_name}? Você poderá restaurar depois.`}>Excluir</ConfirmButton>}</form>
              </div>
            </article>
          ))}</div>
        )}
        <Pagination page={page} hasMore={page * size < (count ?? 0)} searchParams={params} />
      </section>
    </>
  );
}
