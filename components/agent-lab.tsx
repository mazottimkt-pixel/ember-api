"use client";
import { useRef, useState } from "react";
import type { AgentDraft, AgentState } from "@/lib/ai/contracts";

type Turn = { role: "user" | "agent"; text: string };
type Metrics = { model: string; latencyMs: number; inputTokens?: number; outputTokens?: number; totalTokens?: number; estimatedCostUsd?: number };
type AgentResponse = { conversationId: string; reply: string; state: AgentState; draft: AgentDraft; provider: string; metrics?: Metrics; pdfUrl?: string; error?: string };

export function AgentLab() {
  const [conversationId, setConversationId] = useState<string>();
  const [turns, setTurns] = useState<Turn[]>([{ role: "agent", text: "O que você deseja criar hoje: orçamento, pedido de compra ou consultar documentos?" }]);
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<AgentDraft>();
  const [state, setState] = useState<AgentState>("menu");
  const [provider, setProvider] = useState("-");
  const [metrics, setMetrics] = useState<Metrics>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [pdfUrl, setPdfUrl] = useState<string>();
  const [recording, setRecording] = useState(false);
  const [modelStatus, setModelStatus] = useState<string>("Não verificado");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  async function send(action: "message" | "confirm" | "correct" | "cancel" = "message") {
    const message = action === "message" ? text.trim() : action === "confirm" ? "Confirmar" : action === "correct" ? "Corrigir" : "Cancelar";
    if (!message || pending) return;
    setPending(true); setError(undefined); setTurns(v => [...v, { role: "user", text: message }]);
    try {
      const response = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId, idempotencyKey: crypto.randomUUID(), text: message, action }) });
      const data = await response.json() as AgentResponse;
      if (!response.ok) throw new Error(data.error || "Não foi possível processar a mensagem.");
      setConversationId(data.conversationId); setDraft(data.draft); setState(data.state); setProvider(data.provider); setMetrics(data.metrics); setPdfUrl(data.pdfUrl);
      setTurns(v => [...v, { role: "agent", text: data.reply }]); setText("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível processar a mensagem."); }
    finally { setPending(false); }
  }

  async function upload(file?: File) {
    if (!file) return;
    setPending(true); setError(undefined);
    const body = new FormData(); body.set("audio", file);
    try {
      const response = await fetch("/api/agent/transcribe", { method: "POST", body });
      const data = await response.json() as { transcript?: string; metrics?: Metrics; error?: string };
      if (!response.ok || !data.transcript) throw new Error(data.error || "Falha na transcrição.");
      setText(data.transcript); setMetrics(data.metrics); setProvider("openai");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha na transcrição."); }
    finally { setPending(false); }
  }

  async function toggleRecording() {
    if (recording) { recorder.current?.stop(); setRecording(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks.current = [];
      const media = new MediaRecorder(stream); recorder.current = media;
      media.ondataavailable = event => { if (event.data.size) chunks.current.push(event.data); };
      media.onstop = async () => { stream.getTracks().forEach(track => track.stop()); await upload(new File(chunks.current, "gravacao.webm", { type: media.mimeType || "audio/webm" })); };
      media.start(); setRecording(true);
    } catch { setError("Não foi possível acessar o microfone. Verifique a permissão do navegador."); }
  }

  async function verifyModels() {
    setModelStatus("Verificando…");
    try {
      const response = await fetch("/api/agent/models");
      const data = await response.json() as { configured: boolean; text: { id: string; available: boolean | null }; transcription: { id: string; available: boolean | null } };
      setModelStatus(!data.configured ? `Chave não configurada. Texto: ${data.text.id}; áudio: ${data.transcription.id}.` : `Texto ${data.text.id}: ${data.text.available ? "disponível" : "indisponível"}. Áudio ${data.transcription.id}: ${data.transcription.available ? "disponível" : "indisponível"}.`);
    } catch { setModelStatus("Não foi possível verificar os modelos agora."); }
  }

  return <div className="agent-layout">
    <section className="panel agent-chat" aria-label="Conversa de teste">
      <div className="agent-turns" aria-live="polite">{turns.map((turn, index) => <div key={index} className={`agent-message ${turn.role}`}><strong>{turn.role === "agent" ? "Ember" : "Você"}</strong><p>{turn.text}</p></div>)}</div>
      {error && <p className="error" role="alert">{error}</p>}
      <label htmlFor="agent-message">Mensagem ou transcrição</label>
      <textarea id="agent-message" value={text} onChange={e => setText(e.target.value)} maxLength={8000} rows={4} placeholder="Ex.: Faça um orçamento para a Clínica Alfa..." />
      <div className="agent-actions">
        <button className="button" type="button" disabled={pending || !text.trim()} onClick={() => send()}>{pending ? "Processando…" : "Enviar"}</button>
        <label className="button secondary">Enviar áudio<input className="sr-only" type="file" accept="audio/webm,audio/mpeg,audio/mp4,audio/wav,audio/ogg,.m4a" onChange={e => upload(e.target.files?.[0])} /></label>
        <button className="button secondary" type="button" disabled={pending} onClick={toggleRecording}>{recording ? "Parar gravação" : "Gravar áudio"}</button>
      </div>
      <div className="agent-actions">
        <button className="button" type="button" disabled={pending || state !== "awaiting_confirmation"} onClick={() => send("confirm")}>Confirmar</button>
        <button className="button secondary" type="button" disabled={pending} onClick={() => send("correct")}>Corrigir</button>
        <button className="danger-button" type="button" disabled={pending} onClick={() => send("cancel")}>Cancelar</button>
        {pdfUrl && <a className="button secondary" href={pdfUrl}>Baixar PDF</a>}
      </div>
    </section>
    <aside className="panel agent-inspector"><h2>Estado persistido</h2><p><strong>Estado:</strong> {state}</p><p><strong>Provider:</strong> {provider}</p>{metrics && <p className="help"><strong>Métricas:</strong> {metrics.model} · {metrics.latencyMs} ms · {metrics.totalTokens ?? "—"} tokens · US$ {(metrics.estimatedCostUsd ?? 0).toFixed(6)}</p>}<button className="button secondary" type="button" onClick={verifyModels}>Verificar modelos configurados</button><p className="help" aria-live="polite">{modelStatus}</p><pre>{JSON.stringify(draft ?? {}, null, 2)}</pre><p className="help">A chave da OpenAI permanece somente no servidor. Nenhuma ação definitiva é executada sem confirmação.</p></aside>
  </div>;
}
