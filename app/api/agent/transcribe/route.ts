import { NextResponse } from "next/server";
import { requireMembership } from "@/lib/auth/session";
import { getAgentAIProvider } from "@/lib/ai/openai-provider";

export const runtime = "nodejs";
const MAX_AUDIO_BYTES = Math.min(Math.max(Number(process.env.OPENAI_MAX_AUDIO_BYTES) || 10 * 1024 * 1024, 1024), 25 * 1024 * 1024);
const allowed = new Set(["audio/webm", "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-m4a", "audio/ogg"]);

export async function POST(request: Request) {
  const { organizationId } = await requireMembership();
  const form = await request.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File)) return NextResponse.json({ error: "Envie um arquivo de áudio." }, { status: 400 });
  if (!allowed.has(audio.type) || audio.size < 1 || audio.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: "Áudio inválido. Use WebM, MP3, MP4, WAV, M4A ou OGG, com até 10 MB." }, { status: 400 });
  try {
    const provider = getAgentAIProvider();
    if (provider.name === "fallback") return NextResponse.json({ error: "Configure a OpenAI para transcrever áudios." }, { status: 503 });
    const transcript = await provider.transcribe(audio);
    if (!transcript || transcript.length > 8000) throw new Error("INVALID_TRANSCRIPT");
    return NextResponse.json({ transcript });
  } catch (error) {
    console.error("agent.transcription.failed", { code: error instanceof Error ? error.message : "UNKNOWN", organizationId, size: audio.size, type: audio.type });
    return NextResponse.json({ error: "Não foi possível transcrever o áudio. Tente novamente ou digite a mensagem." }, { status: 503 });
  }
}
