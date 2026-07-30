import { NextResponse } from "next/server";
import { requireMembership } from "@/lib/auth/session";
import { FallbackProvider, OpenAIProvider } from "@/lib/ai/openai-provider";

export const runtime = "nodejs";

export async function GET() {
  await requireMembership();
  const textModel = process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini";
  const transcriptionModel = process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe";
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ configured: false, text: { id: textModel, available: null }, transcription: { id: transcriptionModel, available: null }, provider: new FallbackProvider().name });
  }
  const provider = new OpenAIProvider();
  const [textAvailable, transcriptionAvailable] = await Promise.all([
    provider.textModelUsable(textModel).catch(() => false),
    provider.modelAvailable(transcriptionModel).catch(() => false),
  ]);
  return NextResponse.json({ configured: true, text: { id: textModel, available: textAvailable }, transcription: { id: transcriptionModel, available: transcriptionAvailable }, provider: provider.name });
}
