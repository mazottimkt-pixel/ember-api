import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { createWebsite } from "../actions";
import WebsiteForm from "../components/WebsiteForm";

export default async function NewWebsitePage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/admin/login");

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-white sm:p-8">
      <header className="mx-auto mb-8 max-w-3xl">
        <Link href="/admin" className="text-sm text-zinc-400 hover:text-white">← Voltar ao painel</Link>
        <p className="mt-6 text-sm uppercase tracking-widest text-orange-400">Administração</p>
        <h1 className="mt-2 text-3xl font-bold">Novo ativo</h1>
        <p className="mt-2 text-zinc-400">Cadastre um novo domínio na base da Ember.</p>
      </header>
      <div className="mx-auto max-w-3xl"><WebsiteForm action={createWebsite} submitLabel="Salvar ativo" /></div>
    </main>
  );
}
