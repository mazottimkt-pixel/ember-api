import { describe, expect, it } from "vitest";
import { extractTryCloudflareUrl, verificationUrl, WEBHOOK_PATH } from "../scripts/whatsapp-dev-lib.mjs";

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
});
