import { describe, expect, it } from "vitest";
import type { NormalizedInbound } from "@/lib/channels/contracts";
import {
  WHATSAPP_FRIENDLY_FALLBACK,
  agentActionForInbound,
  buildAgentWhatsAppOutputs,
  buildWhatsAppError,
  buildWhatsAppFallback,
  splitWhatsAppText,
  withPdfDeliveryOutcome,
  whatsappConversationKey,
} from "@/lib/whatsapp/agent-bridge";

const inbound = (overrides: Partial<NormalizedInbound> = {}): NormalizedInbound => ({
  channel: "whatsapp",
  externalMessageId: "wamid.inbound",
  externalConversationId: "551198765432",
  organizationId: "018f7787-0d65-7f68-8176-74f8db53d505",
  kind: "text",
  text: "Olá, Lume",
  receivedAt: new Date().toISOString(),
  metadata: {},
  ...overrides,
});

describe("ponte entre WhatsApp e agente Lume", () => {
  it("mantém uma chave persistente por canal e remetente", () => {
    expect(whatsappConversationKey("phone-br", "sender")).toBe(
      whatsappConversationKey("phone-br", "sender"),
    );
    expect(whatsappConversationKey("phone-br", "sender")).not.toBe(
      whatsappConversationKey("phone-br", "outro"),
    );
  });

  it("converte resposta simples do agente em saída textual", () => {
    const outputs = buildAgentWhatsAppOutputs(inbound(), {
      reply: "Olá. Como posso ajudar?",
      state: "menu",
    });
    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toMatchObject({ kind: "text", text: "*Lume • IA*\n\nOlá. Como posso ajudar?" });
  });

  it("quebra respostas longas sem exceder o limite", () => {
    const chunks = splitWhatsAppText("Frase completa. ".repeat(180), 240);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 240)).toBe(true);
  });

  it("mantém confirmação, correção e cancelamento explícitos", () => {
    const outputs = buildAgentWhatsAppOutputs(inbound(), {
      reply: "Revise o resumo antes de confirmar.",
      state: "awaiting_confirmation",
    });
    expect(outputs[0].buttons?.map((button) => button.id)).toEqual([
      "confirm_document",
      "correct_document",
      "cancel_document",
    ]);
    expect(agentActionForInbound(inbound({ kind: "button", buttonId: "confirm" }))).toBe("confirm");
    expect(agentActionForInbound(inbound({ kind: "button", buttonId: "cancel" }))).toBe("cancel");
  });

  it("reconhece o fallback textual real dos botões", () => {
    expect(agentActionForInbound(inbound({ kind: "text", text: "Confirmar" }))).toBe("confirm");
    expect(agentActionForInbound(inbound({ kind: "text", text: "1" }))).toBe("message");
    expect(agentActionForInbound(inbound({ kind: "text", text: "Corrigir" }))).toBe("correct");
    expect(agentActionForInbound(inbound({ kind: "text", text: "Cancelar" }))).toBe("cancel");
  });

  it("coloca os botões somente após a última parte de um resumo longo", () => {
    const outputs = buildAgentWhatsAppOutputs(inbound(), {
      reply: `${"Resumo do orçamento. ".repeat(90)}\n\nRevise os dados antes de confirmar.`,
      state: "awaiting_confirmation",
    });
    expect(outputs.length).toBeGreaterThan(1);
    expect(outputs.slice(0, -1).every((output) => !output.buttons)).toBe(true);
    expect(outputs.at(-1)?.buttons?.map((button) => button.id)).toEqual(["confirm_document", "correct_document", "cancel_document"]);
  });

  it("anexa PDF somente após estado confirmado", () => {
    const outputs = buildAgentWhatsAppOutputs(
      inbound(),
      { reply: "Documento confirmado.", state: "confirmed", documentId: crypto.randomUUID() },
      { url: "https://storage.invalid/signed.pdf", filename: "ORC-1.pdf" },
    );
    expect(outputs.map((output) => output.kind)).toEqual(["text", "document"]);
    expect(outputs[1].metadata.filename).toBe("ORC-1.pdf");
  });

  it("mantém confirmed e oferece retry seguro quando o PDF falha", () => {
    const result = withPdfDeliveryOutcome({ reply: "Confirmado", state: "confirmed" as const, documentId: crypto.randomUUID() }, "PDF_STORAGE_FAILED");
    const outputs = buildAgentWhatsAppOutputs(inbound(), result);
    expect(result.state).toBe("confirmed");
    expect(result.reply).toContain("Gerar PDF");
    expect(outputs).toHaveLength(1);
    expect(outputs[0].buttons).toEqual([{ id: "retry_pdf", label: "Gerar PDF" }]);
  });

  it("preserva fallback amigável sem expor erro técnico", () => {
    expect(buildWhatsAppFallback(inbound()).text).toBe(`*Lume • IA*\n\n${WHATSAPP_FRIENDLY_FALLBACK}`);
    expect(splitWhatsAppText("   ")).toEqual([WHATSAPP_FRIENDLY_FALLBACK]);
  });

  it("diferencia falha anterior à criação e oferece retry idempotente", () => {
    const output = buildWhatsAppError(inbound(), "DRAFT_CREATE_FAILED", "awaiting_confirmation");
    expect(output.text).toContain("Nenhum documento foi gerado");
    expect(output.text).toContain("Seus dados foram preservados");
    expect(output.buttons).toEqual([{ id: "confirm_document", label: "Tentar emitir novamente" }, { id: "correct_document", label: "Corrigir informações" }]);
  });
});
