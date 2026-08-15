"use client";
import { useEffect, useRef, useState } from "react";
import type { AgentState } from "@/lib/ai/contracts";

type Turn = { id: string; role: "user" | "agent"; text: string };
type Response = {
  conversationId?: string;
  reply?: string;
  state?: AgentState;
  error?: string;
  duplicate?: boolean;
};
const suggestions = [
  "Criar orçamento",
  "Criar pedido de compra",
  "Criar post",
  "Criar legenda",
  "Criar roteiro",
  "Criar imagem",
  "Criar campanha",
  "Ver conteúdos",
  "Consultar operações",
  "Consultar documentos",
];

export function LumeCentral() {
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string>();
  const [turns, setTurns] = useState<Turn[]>([
    {
      id: "welcome",
      role: "agent",
      text: "Olá! Eu sou a Lume. Posso ajudar com documentos e informações já disponíveis na sua empresa.",
    },
  ]);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [state, setState] = useState<AgentState>("menu");
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if ((event.target as Element)?.closest("[data-open-lume]")) setOpen(true);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);
  useEffect(() => {
    if (open) {
      input.current?.focus();
      end.current?.scrollIntoView({ block: "end" });
    }
  }, [open, turns, pending]);
  async function send(
    message = text.trim(),
    action: "message" | "confirm" | "correct" | "cancel" = "message",
  ) {
    if (!message || pending) return;
    setPending(true);
    setError(undefined);
    setText("");
    const id = crypto.randomUUID();
    setTurns((current) => [...current, { id, role: "user", text: message }]);
    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId,
          idempotencyKey: id,
          text: message,
          action,
        }),
      });
      const data = (await response.json()) as Response;
      if (!response.ok || !data.reply)
        throw new Error(
          data.error ?? "Não foi possível processar sua solicitação.",
        );
      setConversationId(data.conversationId);
      setState(data.state ?? "menu");
      setTurns((current) => [
        ...current,
        { id: `${id}:response`, role: "agent", text: data.reply! },
      ]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível processar sua solicitação.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <button
        className="lume-trigger"
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Falar com a Lume
      </button>
      {open && (
        <div
          className="lume-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <aside
            className="lume-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lume-title"
          >
            <header>
              <div>
                <span className="eyebrow">ASSISTENTE DA EMPRESA</span>
                <h2 id="lume-title">Falar com a Lume</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar Central da Lume"
              >
                ×
              </button>
            </header>
            <div className="lume-turns" aria-live="polite">
              {turns.map((turn) => (
                <div className={`lume-message ${turn.role}`} key={turn.id}>
                  <strong>{turn.role === "agent" ? "Lume" : "Você"}</strong>
                  <p>{turn.text}</p>
                </div>
              ))}
              {pending && (
                <div className="lume-message agent processing" role="status">
                  Lume está processando…
                </div>
              )}
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              <div ref={end} />
            </div>
            {turns.length <= 1 && (
              <div className="lume-suggestions" aria-label="Sugestões rápidas">
                {suggestions.map((suggestion) => (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => send(suggestion)}
                    disabled={pending}
                    key={suggestion}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            {state === "awaiting_confirmation" && (
              <div
                className="lume-confirmation"
                aria-label="Confirmação explícita"
              >
                <button
                  className="button"
                  type="button"
                  disabled={pending}
                  onClick={() => send("Confirmar", "confirm")}
                >
                  Confirmar
                </button>
                <button
                  className="button secondary"
                  type="button"
                  disabled={pending}
                  onClick={() => send("Corrigir", "correct")}
                >
                  Corrigir
                </button>
                <button
                  className="danger-button"
                  type="button"
                  disabled={pending}
                  onClick={() => send("Cancelar", "cancel")}
                >
                  Cancelar
                </button>
              </div>
            )}
            <form
              className="lume-composer"
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              <label className="sr-only" htmlFor="lume-input">
                Mensagem para a Lume
              </label>
              <textarea
                ref={input}
                id="lume-input"
                rows={2}
                maxLength={8000}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder="Escreva sua mensagem…"
              />
              <button className="button" disabled={pending || !text.trim()}>
                Enviar
              </button>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}
