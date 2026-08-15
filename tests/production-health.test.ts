import { afterEach, describe, expect, it } from "vitest";
import { GET as live } from "@/app/api/health/live/route";
import { GET as webhook } from "@/app/api/health/webhook/route";

const names = [
  "WHATSAPP_VERIFY_TOKEN",
  "META_APP_SECRET",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
] as const;
const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of names) {
    const value = original[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("health checks de produção", () => {
  it("liveness não consulta dependências", async () => {
    const response = live();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "live" });
  });

  it("webhook health não expõe secrets e falha sem configuração", async () => {
    for (const name of names) delete process.env[name];
    const response = webhook();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({ status: "not_ready", signatureVerification: false });
    expect(JSON.stringify(body)).not.toContain("token");
  });

  it("webhook health fica pronto somente com configuração completa", async () => {
    for (const name of names) process.env[name] = "configured-for-test";
    const response = webhook();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ready",
      signatureVerification: true,
    });
  });
});
