import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/whatsapp/processor", () => ({ processWhatsAppEvents: vi.fn() }));

describe("WhatsApp webhook route", () => {
  beforeAll(() => { process.env.WHATSAPP_VERIFY_TOKEN = "verify-test"; process.env.META_APP_SECRET = "app-secret"; });

  it("responde ao desafio de verificação", async () => {
    const { GET } = await import("@/app/api/webhooks/whatsapp/route");
    const response = await GET(new Request("http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-test&hub.challenge=12345"));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("12345");
  });

  it("rejeita assinatura inválida e aceita assinatura válida", async () => {
    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    const body = JSON.stringify({ entry: [] });
    const invalid = await POST(new Request("http://localhost", { method: "POST", body, headers: { "x-hub-signature-256": "sha256=00" } }));
    expect(invalid.status).toBe(401);
    const signature = `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;
    const valid = await POST(new Request("http://localhost", { method: "POST", body, headers: { "x-hub-signature-256": signature } }));
    expect(valid.status).toBe(200);
    expect(await valid.json()).toEqual({ received: true, eventCount: 0 });
  });
});
