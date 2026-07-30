import { OnboardingForm } from "@/components/auth-forms";
import { requireSession } from "@/lib/auth/session";
export default async function Onboarding() {
  await requireSession();
  return (
    <main className="auth">
      <section className="panel">
        <span className="eyebrow">PRIMEIRO ACESSO</span>
        <h1>Configure sua empresa</h1>
        <p className="muted">
          Esta organização será isolada das demais por políticas RLS.
        </p>
        <OnboardingForm />
      </section>
    </main>
  );
}
