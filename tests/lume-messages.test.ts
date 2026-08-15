import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { emptyAgentDraft } from "@/lib/ai/contracts";
import { buildAgentReviewSummary } from "@/lib/ai/summary";
import { shouldSendProcessingMessage } from "@/lib/ai/turn";
import { agentActionForInbound, buildAgentWhatsAppOutputs, splitWhatsAppText } from "@/lib/whatsapp/agent-bridge";
import { ambiguousInformation, documentCaption, formatLumeMessage, friendlyError, friendlyFieldName, lumeMessages, searchResults } from "@/lib/whatsapp/lume-messages";

const inbound = (text: string, buttonId?: string) => ({
  channel: "whatsapp" as const, organizationId: crypto.randomUUID(), externalMessageId: `wamid.${crypto.randomUUID()}`,
  externalConversationId: "5511999999999", kind: buttonId ? "button" as const : "text" as const, text, buttonId,
  receivedAt: new Date().toISOString(), metadata: {},
});

const quote = () => ({ ...emptyAgentDraft(), type: "quote" as const, counterpartyName: "Cliente Exemplo", items: [
  { description: "Consultoria", quantity: 2, unit: "un", unitPrice: 500, discount: 10 },
  { description: "Suporte", quantity: 1, unit: "mês", unitPrice: 200, discount: 0 },
], shipping: 25, deadline: "10 dias", paymentTerms: "50% de entrada", validity: "2026-08-10", notes: "Prioridade alta" });

describe("identidade conversacional da Lume", () => {
  it("aplica a assinatura uma única vez e preserva o conteúdo", () => {
    expect(formatLumeMessage("Olá")).toBe("*Lume • IA*\n\nOlá");
    expect(formatLumeMessage(formatLumeMessage("Olá"))).toBe("*Lume • IA*\n\nOlá");
  });

  it("abre naturalmente sem impor menu ou numeração", () => {
    const outputs = buildAgentWhatsAppOutputs(inbound("oi"), { state: "menu", reply: lumeMessages.opening });
    expect(outputs.at(-1)?.buttons).toBeUndefined();
    expect(outputs[0].text).toContain("O que você precisa hoje?");
    expect(outputs[0].text).not.toMatch(/1 —|Menu de soluções/);
  });

  it.each([
    ["criar orçamento", "create_quote"], ["orçamento", "create_quote"], ["novo orçamento", "create_quote"],
    ["criar pedido", "create_purchase_order"], ["pedido de compra", "create_purchase_order"],
    ["consultar documento", "search_document"], ["buscar documento", "search_document"],
    ["Gerar PDF", "retry_pdf"], ["Tentar outro nome", "retry_contact"],
  ])("normaliza a ação textual %s", (text, action) => expect(agentActionForInbound(inbound(text))).toBe(action));

  it("converte paths técnicos em campos amigáveis", () => {
    expect(friendlyFieldName("items[1].unitPrice")).toBe("valor unitário do item 1");
    expect(ambiguousInformation("counterpartyName")).not.toContain("counterpartyName");
  });

  it("formata resumo integral, valores, itens, desconto, frete e observações", () => {
    const text = buildAgentReviewSummary(quote()).text;
    expect(text).toContain("Revise os dados do orçamento");
    expect(text).toContain("Quantidade: 2");
    expect(text).toContain("Descrição: Suporte");
    expect(text).toContain("*Desconto*");
    expect(text).toContain("*Frete ou acréscimo*");
    expect(text).toContain("Observações: Prioridade alta");
  });

  it("não descarta conteúdo após o oitavo bloco e assina cada mensagem independente", () => {
    const content = Array.from({ length: 12 }, (_, index) => `Bloco ${index + 1}. ${"x".repeat(80)}`).join("\n\n");
    const chunks = splitWhatsAppText(content, 100);
    expect(chunks.length).toBeGreaterThan(8);
    expect(chunks.join(" ")).toContain("Bloco 12");
    const outputs = buildAgentWhatsAppOutputs(inbound("oi"), { state: "collecting", reply: content });
    expect(outputs.every((output) => output.text?.startsWith("*Lume • IA*\n\n"))).toBe(true);
  });

  it("formata consulta com zero, um e vários resultados", () => {
    expect(searchResults([])).toBe(lumeMessages.noSearchResults);
    const doc = { number: "ORC-1", type: "quote", status: "confirmed", total: 100, created_at: "2026-08-04T12:00:00Z", counterparty_snapshot: { name: "Cliente" } };
    expect(searchResults([doc])).toContain("Encontrei 1 documento");
    expect(searchResults([doc, { ...doc, number: "ORC-2" }])).toContain("Encontrei 2 documentos");
    expect(searchResults([doc])).toContain("Cliente ou fornecedor: Cliente");
  });

  it("mapeia erros e mantém legenda documental sem assinatura", () => {
    expect(friendlyError("CONTACT_NOT_FOUND")).toBe(lumeMessages.contactNotFound);
    expect(friendlyError("WHATSAPP_AUDIO_TOO_LARGE")).toBe(lumeMessages.audioTooLarge);
    expect(friendlyError("WHATSAPP_AUDIO_TYPE_INVALID")).toBe(lumeMessages.audioInvalid);
    expect(friendlyError("WHATSAPP_AUDIO_EMPTY")).toBe(lumeMessages.audioEmpty);
    expect(documentCaption("quote", "ORC-1")).toBe("Orçamento ORC-1 • Gerado pela Lume");
    expect(documentCaption("purchase_order", "PC-1")).not.toContain("*Lume • IA*");
  });

  it("só permite a mensagem de processamento na primeira confirmação válida", () => {
    const draft = quote();
    const summary = buildAgentReviewSummary(draft);
    const base = { action: "confirm" as const, state: "awaiting_confirmation" as const, draft, collection: { summary, party: { source: "registered" as const, name: draft.counterpartyName! } } };
    expect(shouldSendProcessingMessage(base)).toBe(true);
    expect(shouldSendProcessingMessage({ ...base, documentId: crypto.randomUUID() })).toBe(false);
    expect(shouldSendProcessingMessage({ ...base, collection: {} })).toBe(false);
  });
});
