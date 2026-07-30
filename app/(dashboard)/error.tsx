"use client";

export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <main className="page">
      <section className="card error" role="alert">
        <h1>Não foi possível carregar esta página</h1>
        <p>
          Confira sua conexão e tente novamente. Nenhuma alteração foi perdida.
        </p>
        <button className="button" onClick={reset} type="button">
          Tentar novamente
        </button>
      </section>
    </main>
  );
}
