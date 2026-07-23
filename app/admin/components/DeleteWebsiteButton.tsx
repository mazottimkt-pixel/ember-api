"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteWebsite } from "../actions";

export default function DeleteWebsiteButton({ id, domain }: { id: string; domain: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  function remove() {
    if (!window.confirm(`Excluir ${domain}? Esta ação não pode ser desfeita.`)) return;
    setError("");
    startTransition(async () => {
      const result = await deleteWebsite(id);
      if (result.error) setError(result.error); else router.refresh();
    });
  }
  return <div><button type="button" onClick={remove} disabled={isPending} className="rounded-lg border border-red-900 px-3 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-50">{isPending ? "Excluindo..." : "Excluir"}</button>{error && <p role="alert" className="mt-2 max-w-48 text-xs text-red-300">{error}</p>}</div>;
}
