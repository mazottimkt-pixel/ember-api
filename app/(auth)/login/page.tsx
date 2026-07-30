import { LoginForm } from "@/components/auth-forms";
export default function Login() {
  return (
    <main className="auth">
      <section className="panel">
        <span className="eyebrow">EMBER COMERCIAL</span>
        <h1>Acesse sua conta</h1>
        <p className="muted">Entre com sua conta da organização.</p>
        <LoginForm />
      </section>
    </main>
  );
}
