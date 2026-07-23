"use client";
export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-white"><section className="max-w-md rounded-xl border border-red-900 bg-zinc-900 p-8 text-center"><h1 className="text-2xl font-bold">Algo deu errado</h1><p className="mt-3 text-zinc-400">Não foi possível abrir esta página administrativa.</p><button type="button" onClick={reset} className="mt-6 rounded-lg bg-orange-500 px-5 py-3 font-bold text-black hover:bg-orange-400">Tentar novamente</button></section></main>;
}
