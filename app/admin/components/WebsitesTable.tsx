"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Website } from "@/lib/websites";
import DeleteWebsiteButton from "./DeleteWebsiteButton";

export default function WebsitesTable({ websites }: { websites: Website[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const statuses = useMemo(() => [...new Set(websites.map((item) => item.status).filter(Boolean))].sort(), [websites]);
  const categories = useMemo(() => [...new Set(websites.map((item) => item.category).filter((value): value is string => Boolean(value)))].sort(), [websites]);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return websites.filter((item) => {
      const matchesSearch = !term || [item.domain, item.owner, item.country].some((value) => value?.toLocaleLowerCase("pt-BR").includes(term));
      return matchesSearch && (!status || item.status === status) && (!category || item.category === category);
    });
  }, [websites, search, status, category]);

  return <><section aria-label="Busca e filtros" className="mb-5 grid gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4 md:grid-cols-3">
    <label className="text-sm text-zinc-300">Buscar<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Domínio, proprietário ou país" className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-white outline-none focus:border-orange-500" /></label>
    <label className="text-sm text-zinc-300">Status<select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-white outline-none focus:border-orange-500"><option value="">Todos</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select></label>
    <label className="text-sm text-zinc-300">Categoria<select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-white outline-none focus:border-orange-500"><option value="">Todas</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></label>
  </section><p className="mb-3 text-sm text-zinc-400">{filtered.length} de {websites.length} ativos</p>
  <section className="overflow-x-auto rounded-xl border border-zinc-800"><table className="w-full min-w-[800px] text-left"><thead className="bg-zinc-900 text-sm text-zinc-400"><tr><th className="p-4">Domínio</th><th className="p-4">Status</th><th className="p-4">Valor</th><th className="p-4">Categoria</th><th className="p-4">Interessados</th><th className="p-4"><span className="sr-only">Ações</span></th></tr></thead><tbody>{filtered.map((website) => <tr key={website.id} className="border-t border-zinc-800 align-top"><td className="p-4 font-semibold">{website.domain}</td><td className="p-4">{website.status}</td><td className="p-4">{website.price || "—"}</td><td className="p-4">{website.category || "—"}</td><td className="p-4">{website.interested ?? 0}</td><td className="p-4"><div className="flex gap-2"><Link href={`/admin/edit/${website.id}`} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-semibold transition hover:bg-zinc-800">Editar</Link><DeleteWebsiteButton id={String(website.id)} domain={website.domain} /></div></td></tr>)}</tbody></table>{!filtered.length && <p className="border-t border-zinc-800 p-8 text-center text-zinc-400">Nenhum ativo corresponde aos filtros.</p>}</section></>;
}
