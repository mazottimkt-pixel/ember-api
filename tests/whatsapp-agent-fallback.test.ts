import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("fallback local da Lume", () => {
  let FallbackProvider: typeof import("@/lib/ai/openai-provider").FallbackProvider;

  beforeAll(async () => {
    ({ FallbackProvider } = await import("@/lib/ai/openai-provider"));
  });

  it("responde naturalmente quando o modelo real está indisponível", async () => {
    const result = await new FallbackProvider().analyze("Olá, Lume");
    expect(result.reply).toContain("Lume");
    expect(result.draft.items).toEqual([]);
  });

  it("preserva a intenção comercial no modo local", async () => {
    const result = await new FallbackProvider().analyze("Quero criar um orçamento");
    expect(result.draft.type).toBe("quote");
  });
});
