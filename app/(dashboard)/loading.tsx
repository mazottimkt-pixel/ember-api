export default function DashboardLoading() {
  return (
    <main className="page" aria-busy="true" aria-live="polite">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-line" />
      <div className="cards">
        <div className="card skeleton skeleton-card" />
        <div className="card skeleton skeleton-card" />
        <div className="card skeleton skeleton-card" />
      </div>
      <span className="sr-only">Carregando conteúdo…</span>
    </main>
  );
}
