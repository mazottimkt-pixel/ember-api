import { requireMembership } from "@/lib/auth/session";
import { saveCatalog, deleteCatalog } from "../crud-actions";
import { restoreCatalog } from "../restore-actions";
import { formatBRL } from "@/lib/domain/calculations";
import { ListToolbar, Pagination } from "@/components/list-toolbar";
import { ConfirmButton, EmptyState, SubmitButton } from "@/components/ui";
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
    .from("catalog_items")
    .select("id,kind,name,description,unit,unit_price,deleted_at", {
      count: "exact",
    });
  query = p.deleted
    ? query.not("deleted_at", "is", null)
    : query.is("deleted_at", null);
  if (p.q) query = query.ilike("name", `%${p.q.replace(/[%_]/g, "")}%`);
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
          <span className="eyebrow">CATÁLOGO</span>
          <h1>Produtos e serviços</h1>
          <p className="muted">Reutilize itens e preços nos seus documentos.</p>
        </div>
      </div>
      <form className="panel form-grid" action={saveCatalog}>
        <div className="field">
          <label htmlFor="kind">Tipo</label>
          <select id="kind" name="kind">
            <option value="product">Produto</option>
            <option value="service">Serviço</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="item-name">Nome *</label>
          <input id="item-name" name="name" required />
        </div>
        <div className="field full">
          <label htmlFor="description">Descrição</label>
          <input id="description" name="description" />
        </div>
        <div className="field">
          <label htmlFor="unit">Unidade</label>
          <select id="unit" name="unit">
            <option>un</option>
            <option>h</option>
            <option>dia</option>
            <option>m²</option>
            <option>kg</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="unit-price">Preço em reais *</label>
          <input
            id="unit-price"
            name="unit_price"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            required
          />
        </div>
        <SubmitButton>Adicionar ao catálogo</SubmitButton>
      </form>
      <section className="panel" style={{ marginTop: 16 }}>
        <ListToolbar
          query={p.q}
          showDeleted={Boolean(p.deleted)}
          placeholder="Buscar produto ou serviço…"
        />
        {!data?.length ? (
          <EmptyState
            title="Catálogo vazio"
            description="Adicione seu produto ou serviço mais vendido."
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Tipo</th>
                  <th>Unidade</th>
                  <th>Preço</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      <div className="help">{item.description}</div>
                    </td>
                    <td>{item.kind === "service" ? "Serviço" : "Produto"}</td>
                    <td>{item.unit}</td>
                    <td>{formatBRL(Number(item.unit_price))}</td>
                    <td>
                      {item.deleted_at ? (
                        <form action={restoreCatalog}>
                          <input type="hidden" name="id" value={item.id} />
                          <SubmitButton className="button secondary">
                            Restaurar
                          </SubmitButton>
                        </form>
                      ) : (
                        <form action={deleteCatalog}>
                          <input type="hidden" name="id" value={item.id} />
                          <ConfirmButton message={`Excluir ${item.name}?`}>
                            Excluir
                          </ConfirmButton>
                        </form>
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
