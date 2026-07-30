export function ListToolbar({
  query,
  placeholder = "Buscar por nome…",
  showDeleted = false,
}: {
  query?: string;
  placeholder?: string;
  showDeleted?: boolean;
}) {
  return (
    <form className="toolbar" method="get" role="search">
      <label className="sr-only" htmlFor="q">
        Buscar
      </label>
      <input id="q" name="q" defaultValue={query} placeholder={placeholder} />
      <select name="sort" aria-label="Ordenação">
        <option value="name">Nome A–Z</option>
        <option value="newest">Mais recentes</option>
      </select>
      <label className="check">
        <input
          type="checkbox"
          name="deleted"
          value="1"
          defaultChecked={showDeleted}
        />{" "}
        Excluídos
      </label>
      <button className="button secondary">Aplicar</button>
    </form>
  );
}
export function Pagination({
  page,
  hasMore,
}: {
  page: number;
  hasMore: boolean;
}) {
  return (
    <nav className="pagination" aria-label="Paginação">
      <a aria-disabled={page <= 1} href={`?page=${Math.max(1, page - 1)}`}>
        ← Anterior
      </a>
      <span>Página {page}</span>
      <a aria-disabled={!hasMore} href={`?page=${page + 1}`}>
        Próxima →
      </a>
    </nav>
  );
}
