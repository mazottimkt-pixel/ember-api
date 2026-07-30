import { verifyMetaSignature } from "@/lib/whatsapp/signature";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (
    mode === "subscribe" &&
    token &&
    token === process.env.WHATSAPP_VERIFY_TOKEN
  )
    return new Response(challenge, { status: 200 });
  return Response.json({ error: "Verificação inválida" }, { status: 403 });
}
export async function POST(request: Request) {
  const rawBody = await request.text();
  if (
    !verifyMetaSignature(
      rawBody,
      request.headers.get("x-hub-signature-256"),
      process.env.META_APP_SECRET ?? "",
    )
  )
    return Response.json({ error: "Assinatura inválida" }, { status: 401 });
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  // Persistência idempotente deve usar whatsapp_message_id UNIQUE na migration. O worker é conectado após configurar Supabase/Meta.
  return Response.json({
    received: true,
    mode: process.env.WHATSAPP_ACCESS_TOKEN ? "configured" : "mock",
    payloadAccepted: Boolean(payload),
  });
}
