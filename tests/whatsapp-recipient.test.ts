import { describe, expect, it } from "vitest";
import {
  isAuthorizedWhatsAppRecipient,
  normalizeWhatsAppRecipient,
} from "@/lib/channels/whatsapp-recipient";

describe("allowlist de destinatários do WhatsApp", () => {
  const authorized = "5511998765432";

  it("autoriza somente o número configurado", () => {
    expect(isAuthorizedWhatsAppRecipient(authorized, authorized)).toBe(true);
    expect(isAuthorizedWhatsAppRecipient("5511991112222", authorized)).toBe(false);
  });

  it("normaliza sinal de mais, espaços, parênteses e traços", () => {
    expect(normalizeWhatsAppRecipient("+55 (11) 99876-5432")).toBe(authorized);
    expect(normalizeWhatsAppRecipient("55 11 99876-5432")).toBe(authorized);
  });

  it("exige DDI brasileiro", () => {
    expect(normalizeWhatsAppRecipient("11998765432")).toBeNull();
    expect(normalizeWhatsAppRecipient(authorized)).toBe(authorized);
  });

  it("trata de forma consistente o nono dígito brasileiro", () => {
    expect(normalizeWhatsAppRecipient("551198765432")).toBe(authorized);
    expect(isAuthorizedWhatsAppRecipient("551198765432", authorized)).toBe(true);
  });

  it("não aproxima destinatários realmente diferentes", () => {
    expect(isAuthorizedWhatsAppRecipient("551198765431", authorized)).toBe(false);
    expect(isAuthorizedWhatsAppRecipient("556198765432", authorized)).toBe(false);
  });
});
