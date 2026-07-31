import { after } from "next/server";
import { parseWhatsAppWebhook } from "@/lib/channels/whatsapp-adapter";
import { processWhatsAppEvents } from "@/lib/whatsapp/processor";
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
  const events = parseWhatsAppWebhook(payload);
  const maskId = (value?: string) => value ? `${value.slice(0, 3)}***${value.slice(-3)}` : null;
  const raw = payload as { entry?: Array<{ changes?: Array<{ value?: { contacts?: unknown[]; messages?: Array<{ id?: string; text?: { body?: string } }> } }> }> };
  const rawMessages = raw.entry?.flatMap((entry) => entry.changes?.flatMap((change) => change.value?.messages ?? []) ?? []) ?? [];
  const hasContact = Boolean(raw.entry?.some((entry) => entry.changes?.some((change) => Boolean(change.value?.contacts?.length))));
  console.info("whatsapp.webhook.accepted", { eventCount: events.length, events: events.map((event) => ({ kind: event.kind, wamidSuffix: event.externalMessageId.slice(-8), phoneNumberId: maskId(event.phoneNumberId), businessAccountId: maskId(event.businessAccountId), hasContact, expectedMarker: rawMessages.some((message) => message.id === event.externalMessageId && message.text?.body === "TESTE REAL LUME 3107") })) });
  after(async () => { await processWhatsAppEvents(events); });
  return Response.json({ received: true, eventCount: events.length });
}
