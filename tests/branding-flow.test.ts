import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { activeBranding, persistBranding } = vi.hoisted(() => ({ activeBranding: vi.fn(), persistBranding: vi.fn() }));
vi.mock("@/lib/branding/store", () => ({ activeBranding, persistBranding }));
vi.mock("@/lib/ai/tools", () => ({ createAgentDraft: vi.fn(), confirmAgentDocument: vi.fn(), queryDocuments: vi.fn() }));
import { emptyAgentDraft } from "@/lib/ai/contracts";
import { runAgentTurn } from "@/lib/ai/turn";
import { agentActionForInbound, buildAgentWhatsAppOutputs } from "@/lib/whatsapp/agent-bridge";
import { lumeButtons, lumeMessages } from "@/lib/whatsapp/lume-messages";

const ctx = { organizationId: crypto.randomUUID(), userId: crypto.randomUUID(), supabase: {} as never };
const input = (action: Parameters<typeof runAgentTurn>[1]["action"], collection = {}) => ({ action, text: action, idempotencyKey: crypto.randomUUID(), state: "menu" as const, draft: emptyAgentDraft(), collection });

describe("submáquina de identidade visual no WhatsApp", () => {
  beforeEach(() => { vi.clearAllMocks(); activeBranding.mockResolvedValue(null); persistBranding.mockResolvedValue({ id: crypto.randomUUID() }); });
  it("entrega valor antes de oferecer personalização", async () => {
    const result = await runAgentTurn(ctx, input("create_quote"));
    expect(result.reply).toBe(lumeMessages.customer);
    expect(result.collection.branding).toBeUndefined();
    expect(result.draft.items).toEqual([]);
  });
  it("não oferece novamente quando há preferência persistida", async () => {
    activeBranding.mockResolvedValue({ status: "configured" });
    const result = await runAgentTurn(ctx, input("create_purchase_order"));
    expect(result.reply).toBe(lumeMessages.supplier);
  });
  it("percorre logo, modelo e cor sem misturar o rascunho", async () => {
    const customize = await runAgentTurn(ctx, input("customize_documents_now", { branding: { state: "offer", resumeAction: "create_quote" } }));
    const noLogo = await runAgentTurn(ctx, input("continue_without_logo", customize.collection));
    const template = await runAgentTurn(ctx, input("template_contemporary", noLogo.collection));
    const color = await runAgentTurn(ctx, { ...input("message", template.collection), text: "1F3A5F" });
    expect(customize.reply).toBe(lumeMessages.brandingLogo);
    expect(noLogo.reply).toContain("Contemporâneo");
    expect(template.reply).toBe(lumeMessages.brandingColor);
    expect(color.reply).toBe(lumeMessages.brandingPreview);
    expect(color.collection.branding).toMatchObject({ templateId: "contemporary", primaryColor: "#1F3A5F" });
  });
  it("aprova e retoma o orçamento preservado", async () => {
    const collection = { branding: { state: "awaiting_approval" as const, resumeAction: "create_quote" as const, templateId: "essential" as const, primaryColor: "#2563EB", logoStoragePath: null } };
    const result = await runAgentTurn(ctx, input("approve_document_branding", collection));
    expect(persistBranding).toHaveBeenCalledOnce();
    expect(result.reply).toContain("Sua identidade visual foi configurada.");
    expect(result.reply).toContain("Vamos começar pelo cliente.");
    expect(result.draft.type).toBe("quote");
  });
  it.each([["use_default_document_style", "default"], ["configure_documents_later", "skipped_for_now"]] as const)("persiste %s e retoma", async (action, status) => {
    const result = await runAgentTurn(ctx, input(action, { branding: { state: "offer", resumeAction: "create_purchase_order" } }));
    expect(persistBranding).toHaveBeenCalledWith(ctx, expect.objectContaining({ status }));
    expect(result.draft.type).toBe("purchase_order");
  });
  it("normaliza comandos e mantém botões operantes", () => {
    const inbound = (text: string) => ({ channel: "whatsapp" as const, organizationId: crypto.randomUUID(), externalMessageId: "wamid.x", externalConversationId: "5511", kind: "text" as const, text, receivedAt: new Date().toISOString(), metadata: {} });
    expect(agentActionForInbound(inbound("Configurar identidade visual"))).toBe("configure_branding");
    expect(agentActionForInbound(inbound("Essencial"))).toBe("template_essential");
    const outputs = buildAgentWhatsAppOutputs(inbound("oi"), { state: "menu", reply: lumeMessages.brandingOffer });
    expect(outputs.at(-1)?.buttons).toEqual(lumeButtons.brandingOffer);
    expect(outputs[0].text).toContain("*Lume • IA*");
  });
});
