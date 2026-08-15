import { describe, expect, it } from "vitest";
import { emptyAgentDraft } from "@/lib/ai/contracts";
import { consumeConversationPrompt, createConversationPrompt, resolveActivePrompt } from "@/lib/navigation/conversation-prompts";
import { conversationLifecycle, isExplicitNewSessionCommand, isStandaloneGreeting, shouldStartNewSession } from "@/lib/navigation/session-policy";

const confirmation = (presentedAt?: string) => createConversationPrompt({
  ...(presentedAt ? { presentedAt } : {}), promptType: "confirmation", flowId: "quote", expectedState: "awaiting_confirmation",
  options: [{ number: 1, id: "confirm", label: "Confirmar" }, { number: 2, id: "correct", label: "Corrigir" }, { number: 3, id: "cancel", label: "Cancelar" }],
});
const draft = { ...emptyAgentDraft(), type: "quote" as const, counterpartyName: "Cliente", items: [{ description: "Serviço", quantity: 1, unit: "un", unitPrice: 100, discount: 0 }] };
const summary = { version: "commercial-summary-v2", draft, fingerprint: "x", text: "Resumo", presentedAt: "2026-08-12T12:00:00.000Z" };
const now = new Date("2026-08-12T13:00:00.000Z");

describe("política de sessão e contexto", () => {
  it("A — saudação isolada abandona confirmação antiga", () => {
    expect(shouldStartNewSession({ message: "Olá, Lume", state: "awaiting_confirmation", draft, collection: { summary, activePrompt: confirmation("2026-08-10T12:00:00.000Z") }, updatedAt: "2026-08-10T12:00:00.000Z", now })).toBe(true);
  });
  it("B — comandos globais/reinício são inequívocos, mas palavra dentro de frase não reinicia", () => {
    expect(isExplicitNewSessionCommand("Nova operação")).toBe(true);
    expect(isStandaloneGreeting("Olá, preciso corrigir o endereço desse orçamento")).toBe(false);
  });
  it("C — resposta direta preserva fluxo ativo recente", () => {
    expect(shouldStartNewSession({ message: "7 dias", state: "collecting", draft, collection: { pendingField: "validade" }, updatedAt: "2026-08-12T12:55:00.000Z", now })).toBe(false);
    expect(conversationLifecycle({ state: "collecting", draft, collection: { pendingField: "validade" }, updatedAt: "2026-08-12T12:55:00.000Z", now })).toBe("active_flow");
  });
  it("D — número executa somente opção do prompt atual", () => expect(resolveActivePrompt("1", confirmation(), "awaiting_confirmation")?.id).toBe("confirm"));
  it("E — número de prompt consumido ou antigo não executa", () => {
    expect(resolveActivePrompt("1", consumeConversationPrompt(confirmation()), "awaiting_confirmation")).toBeUndefined();
    expect(resolveActivePrompt("1", confirmation("2026-08-10T12:00:00.000Z"), "awaiting_confirmation")).toBeUndefined();
  });
  it("F — reinício de servidor preserva estado recente e coerente", () => expect(conversationLifecycle({ state: "awaiting_confirmation", draft, collection: { summary, activePrompt: confirmation() }, updatedAt: "2026-08-12T12:59:00.000Z", now })).toBe("pending_confirmation"));
  it("G — fluxo concluído inicia sessão limpa diante de nova entrada explícita", () => expect(shouldStartNewSession({ message: "Começar novamente", state: "confirmed", draft, collection: { summary }, updatedAt: "2026-08-12T12:59:00.000Z", now })).toBe(true));
});
