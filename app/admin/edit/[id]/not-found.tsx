import Link from "next/link";
export default function WebsiteNotFound() {
  return <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-white"><section className="max-w-md text-center"><h1 className="text-3xl font-bold">Ativo não encontrado</h1><p className="mt-3 text-zinc-400">O registro pode ter sido excluído ou você não tem acesso a ele.</p><Link href="/admin" className="mt-6 inline-block rounded-lg bg-orange-500 px-5 py-3 font-bold text-black hover:bg-orange-400">Voltar ao painel</Link></section></main>;
}
