import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import type { Website } from "@/lib/websites";
import LogoutButton from "./components/LogoutButton";
import WebsitesTable from "./components/WebsitesTable";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/admin/login");
  const { data, error } = await supabase.from("websites").select("id, domain, status, price, category, owner, country, created_at, interested").order("id", { ascending: true });
  return <main className="min-h-screen bg-zinc-950 px-4 py-6 text-white sm:p-8"><header className="mx-auto mb-8 flex max-w-7xl flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm uppercase tracking-widest text-orange-400">Administração</p><h1 className="mt-2 text-3xl font-bold">Painel Ember</h1><p className="mt-2 text-zinc-400">Gerencie os ativos cadastrados na plataforma.</p></div><div className="flex flex-wrap items-center gap-3"><Link href="/admin/new" className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-black transition hover:bg-orange-400">Novo ativo</Link><LogoutButton /></div></header><div className="mx-auto max-w-7xl">{error ? <div role="alert" className="rounded-xl border border-red-900 bg-red-950 p-5 text-red-300"><p className="font-semibold">Não foi possível carregar os domínios.</p><p className="mt-1 text-sm">Atualize a página e tente novamente.</p></div> : <WebsitesTable websites={(data ?? []) as Website[]} />}</div></main>;
}
