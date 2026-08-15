import { describe, expect, it, vi, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
import { MetaApiError, WhatsAppChannelAdapter, isConfirmationButtonFallback, parseWhatsAppWebhook, shouldAdvanceWhatsAppStatus } from "@/lib/channels/whatsapp-adapter";

const payload = (value: Record<string, unknown>) => ({ entry: [{ id: "waba", changes: [{ field: "messages", value: { metadata: { phone_number_id: "phone" }, ...value } }] }] });

describe("WhatsApp Cloud API adapter", () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.WHATSAPP_TEST_RECIPIENT; });

  it("prepara envio de imagem aprovado sem chamada real à Meta", async () => {
    process.env.WHATSAPP_TEST_RECIPIENT = "5511999999999";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({messages:[{id:"wamid.mock"}]}),{status:200}));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new WhatsAppChannelAdapter({accessToken:"mock",phoneNumberId:"123",apiVersion:"v23.0"});
    await adapter.deliver({channel:"whatsapp",conversationId:"5511999999999",kind:"image",mediaReference:"https://signed.invalid/image.png",text:"Legenda",metadata:{contentStatus:"approved"}});
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({type:"image",image:{link:"https://signed.invalid/image.png",caption:"Legenda"}});
  });

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

  it("envia texto e documento somente ao destinatário autorizado", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ messages: [{ id: "wamid.out" }] }), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    process.env.WHATSAPP_TEST_RECIPIENT = "+55 11 99876-5432";
    const adapter = new WhatsAppChannelAdapter({ accessToken: "secret", phoneNumberId: "phone", apiVersion: "v1.0" });
    await adapter.deliver({ channel: "whatsapp", conversationId: "551198765432", kind: "text", text: "Olá", metadata: {} });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(String(init.body)).toContain('"type":"text"');
    await expect(adapter.deliver({ channel: "whatsapp", conversationId: "551197654321", kind: "text", text: "Olá", metadata: {} })).rejects.toThrow("WHATSAPP_RECIPIENT_NOT_ALLOWED");
    await adapter.deliver({ channel: "whatsapp", conversationId: "551198765432", kind: "document", mediaReference: "https://signed.invalid/pdf", text: "Documento", metadata: { filename: "orcamento.pdf" } });
    expect(String(fetchMock.mock.calls[1][1]?.body)).toContain('"type":"document"');
  });

  it("envia botões de confirmação com fallback textual preparado", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.button" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    process.env.WHATSAPP_TEST_RECIPIENT = "5511998765432";
    const adapter = new WhatsAppChannelAdapter({ accessToken: "secret", phoneNumberId: "phone", apiVersion: "v1.0" });
    await adapter.deliver({ channel: "whatsapp", conversationId: "551198765432", kind: "text", text: "Revise", buttons: [{ id: "confirm_document", label: "Confirmar" }, { id: "correct_document", label: "Corrigir" }, { id: "cancel_document", label: "Cancelar" }], metadata: {} });
    const payload=JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(payload).toMatchObject({type:"interactive",interactive:{type:"button",body:{text:"Revise"},action:{buttons:[{type:"reply",reply:{id:"confirm_document",title:"Confirmar"}},{type:"reply",reply:{id:"correct_document",title:"Corrigir"}},{type:"reply",reply:{id:"cancel_document",title:"Cancelar"}}]}}});
    expect(JSON.stringify(payload)).not.toContain('"label"');
  });

  it("usa fallback numérico somente após falha real dos botões atuais de confirmação", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "interactive rejected", code: 100 } }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "wamid.fallback" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock); process.env.WHATSAPP_TEST_RECIPIENT = "551198765432";
    const adapter = new WhatsAppChannelAdapter({ accessToken: "secret", phoneNumberId: "phone", apiVersion: "v1.0" });
    const output = { channel: "whatsapp" as const, conversationId: "551198765432", kind: "text" as const, text: "Revise", buttons: [{ id: "confirm_document", label: "Confirmar" }, { id: "correct_document", label: "Corrigir" }, { id: "cancel_document", label: "Cancelar" }], metadata: { state: "awaiting_confirmation" } };
    expect(isConfirmationButtonFallback(output)).toBe(true);
    await adapter.deliver(output);
    expect(String(fetchMock.mock.calls[1][1]?.body)).toContain("Para continuar");
    expect(String(fetchMock.mock.calls[1][1]?.body)).not.toContain("botões não ficaram");
  });

  it.each(["cancelled", "collecting", "menu", "confirmed"])("estado %s nunca recebe fallback de confirmação", (state) => {
    expect(isConfirmationButtonFallback({ channel: "whatsapp", conversationId: "5511", kind: "text", text: "Atual", buttons: [{ id: "confirm_document", label: "Confirmar" }, { id: "correct_document", label: "Corrigir" }, { id: "cancel_document", label: "Cancelar" }], metadata: { state } })).toBe(false);
  });

  it("descarta botões de confirmação obsoletos se uma saída terminal for rejeitada", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 100 } }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "wamid.safe" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock); process.env.WHATSAPP_TEST_RECIPIENT = "551198765432";
    const adapter = new WhatsAppChannelAdapter({ accessToken: "secret", phoneNumberId: "phone", apiVersion: "v1.0" });
    await adapter.deliver({ channel: "whatsapp", conversationId: "551198765432", kind: "text", text: "Operação cancelada", buttons: [{ id: "confirm", label: "Confirmar" }, { id: "correct", label: "Corrigir" }, { id: "cancel", label: "Cancelar" }], metadata: { state: "cancelled" } });
    const fallbackBody = String(fetchMock.mock.calls[1][1]?.body);
    expect(fallbackBody).not.toContain("Os botões não ficaram disponíveis");
    expect(fallbackBody).not.toContain("1 — Confirmar");
  });

  it("repete somente falhas recuperáveis", () => {
    expect(new MetaApiError(429).retryable).toBe(true);
    expect(new MetaApiError(400).retryable).toBe(false);
  });
});
