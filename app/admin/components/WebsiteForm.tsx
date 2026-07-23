"use client";

import { useActionState } from "react";
import type { Website, WebsiteFormState } from "@/lib/websites";
import { initialWebsiteFormState } from "@/lib/websites";
import WebsiteFields from "./WebsiteFields";

type Action = (state: WebsiteFormState, formData: FormData) => Promise<WebsiteFormState>;

export default function WebsiteForm({ action, website, submitLabel }: { action: Action; website?: Website; submitLabel: string }) {
  const [state, formAction, isPending] = useActionState(action, initialWebsiteFormState);

  return (
    <form action={formAction} className="space-y-6 rounded-xl border border-zinc-800 bg-zinc-900 p-5 sm:p-8">
      <fieldset disabled={isPending} className="space-y-6">
        <WebsiteFields website={website} state={state} />
      </fieldset>
      {state.error && (
        <p role="alert" aria-live="polite" className="rounded-lg border border-red-900 bg-red-950 p-3 text-sm text-red-300">{state.error}</p>
      )}
      <button type="submit" disabled={isPending} className="w-full rounded-lg bg-orange-500 py-3 font-bold text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50">
        {isPending ? "Salvando..." : submitLabel}
      </button>
    </form>
  );
}
