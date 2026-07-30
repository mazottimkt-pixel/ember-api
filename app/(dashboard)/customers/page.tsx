import { requireMembership } from "@/lib/auth/session";
import { saveParty, deleteParty } from "../crud-actions";
import { restoreParty } from "../restore-actions";
import { ListToolbar, Pagination } from "@/components/list-toolbar";
import {
  ConfirmButton,
  EmptyState,
  MaskedInput,
  SubmitButton,
} from "@/components/ui";
export default async function Page({
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
    .from("customers")
    .select("id,name,tax_id,email,phone,deleted_at", { count: "exact" });
  query = p.deleted
    ? query.not("deleted_at", "is", null)
    : query.is("deleted_at", null);
  if (p.q)
    query = query.or(
      `name.ilike.%${p.q.replace(/[%_,]/g, "")}%,tax_id.ilike.%${p.q.replace(/[%_,]/g, "")}%`,
    );
  query =
    p.sort === "newest"
      ? query.order("created_at", { ascending: false })
      : query.order("name");
  const { data = [], count = 0 } = await query.range(
    (page - 1) * size,
    page * size - 1,
  );
  return (
    <>
      <div className="topline">
        <div>
          <span className="eyebrow">RELACIONAMENTOS</span>
          <h1>Clientes</h1>
          <p className="muted">
            Pessoas e empresas que recebem seus orçamentos.
          </p>
        </div>
      </div>
      <form
        className="panel form-grid"
        action={saveParty.bind(null, "customers")}
      >
        <div className="field">
          <label htmlFor="customer-name">Nome *</label>
          <input id="customer-name" name="name" required minLength={2} />
        </div>
        <div className="field">
          <label htmlFor="customer-tax">CPF ou CNPJ</label>
          <MaskedInput
            id="customer-tax"
            name="tax_id"
            mask="document"
            inputMode="numeric"
          />
        </div>
        <div className="field">
          <label htmlFor="customer-email">E-mail</label>
          <input id="customer-email" name="email" type="email" />
        </div>
        <div className="field">
          <label htmlFor="customer-phone">Telefone</label>
          <MaskedInput
            id="customer-phone"
            name="phone"
            mask="phone"
            inputMode="tel"
          />
        </div>
        <SubmitButton>Adicionar cliente</SubmitButton>
      </form>
      <section className="panel" style={{ marginTop: 16 }}>
        <ListToolbar query={p.q} showDeleted={Boolean(p.deleted)} />
        {!data?.length ? (
          <EmptyState
            title="Nenhum cliente encontrado"
            description="Cadastre um cliente ou ajuste os filtros."
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Documento</th>
                  <th>Contato</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                    </td>
                    <td>{item.tax_id || "—"}</td>
                    <td>{item.email || item.phone || "—"}</td>
                    <td>
                      <div className="actions">
                        {item.deleted_at ? (
                          <form action={restoreParty.bind(null, "customers")}>
                            <input type="hidden" name="id" value={item.id} />
                            <SubmitButton
                              className="button secondary"
                              pending="…"
                            >
                              Restaurar
                            </SubmitButton>
                          </form>
                        ) : (
                          <form action={deleteParty.bind(null, "customers")}>
                            <input type="hidden" name="id" value={item.id} />
                            <ConfirmButton
                              message={`Excluir ${item.name}? Você poderá restaurar depois.`}
                            >
                              Excluir
                            </ConfirmButton>
                          </form>
                        )}
                      </div>
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
