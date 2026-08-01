import { describe, expect, it } from "vitest";
import { extractTryCloudflareUrl, signedPostHealth, verificationUrl, WEBHOOK_PATH } from "../scripts/whatsapp-dev-lib.mjs";

describe("WhatsApp dev supervisor", () => {
  it("extrai somente URL HTTPS do quick tunnel", () => {
    expect(extractTryCloudflareUrl("ready https://safe-name.trycloudflare.com now")).toBe("https://safe-name.trycloudflare.com");
    expect(extractTryCloudflareUrl("sem túnel")).toBeNull();
  });

  it("monta handshake GET sem alterar a rota", () => {
    const url = verificationUrl("https://safe-name.trycloudflare.com", "secret local", "challenge");
    expect(url.pathname).toBe(WEBHOOK_PATH);
    expect(url.searchParams.get("hub.mode")).toBe("subscribe");
    expect(url.searchParams.get("hub.verify_token")).toBe("secret local");
    expect(url.searchParams.get("hub.challenge")).toBe("challenge");
  });

  it("aceita somente resposta válida do POST assinado", async () => {
    const originalFetch = global.fetch;
    global.fetch = async (_input, init) => {
      expect(init?.headers).toMatchObject({ "x-hub-signature-256": expect.stringMatching(/^sha256=[a-f0-9]{64}$/) });
      return Response.json({ received: true, eventCount: 0 });
    };
    await expect(signedPostHealth("http://127.0.0.1:3100", "app-secret")).resolves.toBe(200);
    global.fetch = originalFetch;
  });
});
