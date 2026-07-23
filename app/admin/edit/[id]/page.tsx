import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import type { Website } from "@/lib/websites";
import { updateWebsite } from "../../actions";
import WebsiteForm from "../../components/WebsiteForm";

export default async function EditWebsitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id || id.length > 100) notFound();
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/admin/login");

  const { data, error } = await supabase
    .from("websites")
    .select("id, domain, status, price, category, owner, country, created_at, interested")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("Failed to load website for editing", { code: error.code });
    throw new Error("Não foi possível carregar o ativo para edição.");
  }
  if (!data) notFound();

  const action = updateWebsite.bind(null, id);
  return <main className="min-h-screen bg-zinc-950 px-4 py-8 text-white sm:p-8"><header className="mx-auto mb-8 max-w-3xl"><Link href="/admin" className="text-sm text-zinc-400 hover:text-white">← Voltar ao painel</Link><p className="mt-6 text-sm uppercase tracking-widest text-orange-400">Administração</p><h1 className="mt-2 text-3xl font-bold">Editar ativo</h1><p className="mt-2 break-words text-zinc-400">Altere as informações de {data.domain}.</p></header><div className="mx-auto max-w-3xl"><WebsiteForm action={action} website={data as Website} submitLabel="Salvar alterações" /></div></main>;
}
