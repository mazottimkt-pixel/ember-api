import Image from "next/image";
import { LoginForm } from "@/components/login-form";
import styles from "./login.module.css";

export default function Login() {
  return (
    <main className={styles.page}>
      <section className={styles.loginPanel} aria-labelledby="login-title">
        <div className={styles.emberBrand}>
          <Image
            src="/brand/ember/ember-logo.png"
            alt="Ember"
            width={220}
            height={220}
            priority
            unoptimized
          />
        </div>

        <div className={styles.mobileLume} aria-hidden="true">
          <Image
            src="/brand/lume/lume-agent.png"
            alt=""
            width={112}
            height={112}
            priority
            unoptimized
          />
          <div>
            <span>Lume by Ember</span>
            <strong>Assistente comercial inteligente</strong>
          </div>
        </div>

        <div className={styles.formCard}>
          <div className={styles.welcomeLine}>
            <span aria-hidden="true" />
            Bem-vindo de volta
          </div>
          <h1 id="login-title">Bem-vindo de volta</h1>
          <p className={styles.subtitle}>
            Entre para acessar sua operação comercial
          </p>
          <LoginForm />
        </div>

        <p className={styles.securityNote}>
          <span aria-hidden="true">◆</span> Ambiente seguro Ember Comercial
        </p>
      </section>

      <aside className={styles.lumePanel} aria-label="Lume by Ember">
        <div className={styles.ambientGlow} aria-hidden="true" />
        <div className={styles.sparkField} aria-hidden="true">
          <i /><i /><i /><i /><i /><i /><i />
        </div>
        <div className={styles.lumeContent}>
          <div className={styles.lumeMark}>
            <Image
              src="/brand/lume/lume-agent.png"
              alt="Símbolo oficial da Lume"
              width={760}
              height={760}
              priority
              unoptimized
            />
          </div>
          <div className={styles.lumeByline}>
            <span aria-hidden="true" />
            Lume by Ember
            <span aria-hidden="true" />
          </div>
          <h2>Lume</h2>
          <p>
            Operações comerciais inteligentes,
            <br />
            impulsionadas pela <strong>Ember.</strong>
          </p>
        </div>
      </aside>
    </main>
  );
}
