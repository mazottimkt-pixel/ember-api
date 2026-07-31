import { describe, expect, it, vi, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
import { MetaApiError, WhatsAppChannelAdapter, parseWhatsAppWebhook, shouldAdvanceWhatsAppStatus } from "@/lib/channels/whatsapp-adapter";

const payload = (value: Record<string, unknown>) => ({ entry: [{ id: "waba", changes: [{ field: "messages", value: { metadata: { phone_number_id: "phone" }, ...value } }] }] });

describe("WhatsApp Cloud API adapter", () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.WHATSAPP_TEST_RECIPIENT; });

  it.each([
    [{ id: "wamid.text", from: "5511999", timestamp: "1700000000", type: "text", text: { body: "Olá" } }, "text"],
    [{ id: "wamid.audio", from: "5511999", timestamp: "1700000000", type: "audio", audio: { id: "media", mime_type: "audio/ogg" } }, "audio"],
    [{ id: "wamid.button", from: "5511999", timestamp: "1700000000", type: "interactive", interactive: { button_reply: { id: "confirm", title: "Confirmar" } } }, "button"],
  ])("normaliza mensagens %s", (message, kind) => expect(parseWhatsAppWebhook(payload({ messages: [message] }))[0].kind).toBe(kind));

  it("interpreta status e impede regressão fora de ordem", () => {
    const event = parseWhatsAppWebhook(payload({ statuses: [{ id: "wamid.out", recipient_id: "5511999", timestamp: "1700000000", status: "delivered" }] }))[0];
    expect(event.status).toBe("delivered");
    expect(shouldAdvanceWhatsAppStatus("read", "delivered")).toBe(false);
    expect(shouldAdvanceWhatsAppStatus("sent", "read")).toBe(true);
  });

  it("envia somente texto ao destinatário autorizado", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.out" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    process.env.WHATSAPP_TEST_RECIPIENT = "5511999";
    const adapter = new WhatsAppChannelAdapter({ accessToken: "secret", phoneNumberId: "phone", apiVersion: "v1.0" });
    await adapter.deliver({ channel: "whatsapp", conversationId: "5511999", kind: "text", text: "Olá", metadata: {} });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(String(init.body)).toContain('"type":"text"');
    await expect(adapter.deliver({ channel: "whatsapp", conversationId: "5511888", kind: "text", text: "Olá", metadata: {} })).rejects.toThrow("WHATSAPP_RECIPIENT_NOT_ALLOWED");
    await expect(adapter.deliver({ channel: "whatsapp", conversationId: "5511999", kind: "document", mediaReference: "https://signed.invalid/pdf", metadata: {} })).rejects.toThrow("WHATSAPP_TEXT_ONLY_MODE");
  });

  it("repete somente falhas recuperáveis", () => {
    expect(new MetaApiError(429).retryable).toBe(true);
    expect(new MetaApiError(400).retryable).toBe(false);
  });
});
