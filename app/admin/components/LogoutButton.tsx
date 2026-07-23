"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";

export default function LogoutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    setIsPending(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      setError("Não foi possível sair.");
      setIsPending(false);
      return;
    }

    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div><button
      type="button"
      onClick={logout}
      disabled={isPending}
      className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isPending ? "Saindo..." : "Sair"}
    </button>{error && <p role="alert" className="mt-1 text-xs text-red-300">{error}</p>}</div>
  );
}
