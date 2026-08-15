"use client";

import { useActionState, useState } from "react";
import { login, type AuthState } from "@/app/(auth)/actions";
import styles from "@/app/(auth)/login/login.module.css";

const initialState: AuthState = {};

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.8 6.2h16.4v11.6H3.8z" />
      <path d="m4.5 7 7.5 6 7.5-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5.5" y="10" width="13" height="10" rx="2" />
      <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
    </svg>
  );
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 12s3.5-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.5 5.5-9.5 5.5S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.5" />
      {hidden && <path d="m4 4 16 16" />}
    </svg>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={action} className={styles.form} aria-busy={pending}>
      <div className={styles.field}>
        <label htmlFor="email">E-mail</label>
        <div className={styles.inputWrap}>
          <MailIcon />
          <input
            name="email"
            id="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="voce@empresa.com.br"
            aria-describedby={state.error ? "login-error" : undefined}
          />
        </div>
      </div>

      <div className={styles.field}>
        <div className={styles.labelRow}>
          <label htmlFor="password">Senha</label>
          <span className={styles.recoveryUnavailable} title="Recuperação de senha ainda não configurada">
            Esqueci minha senha
          </span>
        </div>
        <div className={styles.inputWrap}>
          <LockIcon />
          <input
            name="password"
            id="password"
            type={showPassword ? "text" : "password"}
            required
            minLength={8}
            autoComplete="current-password"
            placeholder="Digite sua senha"
            aria-describedby={state.error ? "login-error" : undefined}
          />
          <button
            type="button"
            className={styles.passwordToggle}
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={
              showPassword
                ? "Ocultar conteúdo digitado"
                : "Mostrar conteúdo digitado"
            }
            aria-pressed={showPassword}
          >
            <EyeIcon hidden={showPassword} />
          </button>
        </div>
      </div>

      {state.error && (
        <p id="login-error" className={styles.error} role="alert" aria-live="polite">
          <span aria-hidden="true">!</span>
          E-mail ou senha inválidos. Verifique os dados e tente novamente.
        </p>
      )}

      <button className={styles.submit} disabled={pending} type="submit">
        <span>{pending ? "Entrando..." : "Entrar"}</span>
        {pending ? (
          <span className={styles.spinner} aria-hidden="true" />
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h14M14 7l5 5-5 5" />
          </svg>
        )}
      </button>
    </form>
  );
}
