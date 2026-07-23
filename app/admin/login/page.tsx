"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });

    if (error) {
      setMessage("E-mail ou senha inválidos.");
      setLoading(false);
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <section className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-8">
        <p className="text-sm uppercase tracking-widest text-orange-400">
          Administração
        </p>

        <h1 className="mt-2 text-2xl font-bold text-white">
          Login Ember
        </h1>

        <form onSubmit={login} className="mt-6 space-y-4">
          <label htmlFor="email" className="sr-only">E-mail</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            placeholder="E-mail"
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-white outline-none focus:border-orange-500"
          />
          <label htmlFor="password" className="sr-only">Senha</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            placeholder="Senha"
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-white outline-none focus:border-orange-500"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-orange-500 py-3 font-bold text-black disabled:opacity-50"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>

          {message && (
            <p role="alert" aria-live="polite" className="text-sm text-red-400">
              {message}
            </p>
          )}
        </form>
      </section>
    </main>
  );
}
