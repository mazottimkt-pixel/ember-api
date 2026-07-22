import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { data: websites, error } = await supabase
    .from("websites")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    return (
      <main className="min-h-screen bg-zinc-950 p-8 text-white">
        <h1 className="text-2xl font-bold">Painel Ember</h1>

        <p className="mt-6 text-red-400">
          Não foi possível carregar os domínios.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 p-8 text-white">
      <header className="mb-8">
        <p className="text-sm uppercase tracking-widest text-orange-400">
          Administração
        </p>

        <h1 className="mt-2 text-3xl font-bold">Painel Ember</h1>

        <p className="mt-2 text-zinc-400">
          Gerencie os ativos cadastrados na plataforma.
        </p>
      </header>

      <section className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full text-left">
          <thead className="bg-zinc-900 text-sm text-zinc-400">
            <tr>
              <th className="p-4">Domínio</th>
              <th className="p-4">Status</th>
              <th className="p-4">Valor</th>
              <th className="p-4">Categoria</th>
              <th className="p-4">Interessados</th>
            </tr>
          </thead>

          <tbody>
            {websites?.map((website) => (
              <tr
                key={website.id}
                className="border-t border-zinc-800"
              >
                <td className="p-4 font-semibold">{website.domain}</td>
                <td className="p-4">{website.status}</td>
                <td className="p-4">{website.price}</td>
                <td className="p-4">{website.category}</td>
                <td className="p-4">{website.interested}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}