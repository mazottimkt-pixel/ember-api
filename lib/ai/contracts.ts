import { z } from "zod";

export const agentItemSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().positive(),
  unit: z.string().trim().min(1).max(20),
  unitPrice: z.number().finite().min(0),
  discount: z.number().finite().min(0).default(0),
});

export const agentDraftSchema = z.object({
  type: z.enum(["quote", "purchase_order", "document_search"]).nullable(),
  counterpartyName: z.string().trim().max(160).nullable(),
  items: z.array(agentItemSchema).max(50),
  shipping: z.number().finite().min(0).nullable(),
  validity: z.string().trim().max(10).nullable(),
  deadline: z.string().trim().max(160).nullable(),
  paymentTerms: z.string().trim().max(300).nullable(),
  deliveryAddress: z.string().trim().max(500).nullable(),
  notes: z.string().trim().max(2000).nullable(),
  documentQuery: z.string().trim().max(160).nullable(),
});

export const agentDecisionSchema = z.object({
  intent: z.enum(["quote", "purchase_order", "document_search", "correction", "cancel", "unknown"]),
  draft: agentDraftSchema,
  ambiguities: z.array(z.string().trim().max(240)).max(10),
  reply: z.string().trim().min(1).max(800),
});

export type AgentDraft = z.infer<typeof agentDraftSchema>;
export type AgentDecision = z.infer<typeof agentDecisionSchema>;
export type AgentState = "menu" | "collecting" | "awaiting_confirmation" | "confirmed" | "cancelled" | "error";

export const emptyAgentDraft = (): AgentDraft => ({
  type: null, counterpartyName: null, items: [], shipping: 0, validity: null,
  deadline: null, paymentTerms: null, deliveryAddress: null, notes: null, documentQuery: null,
});

export const agentRequestSchema = z.object({
  conversationId: z.uuid().optional(),
  idempotencyKey: z.uuid(),
  text: z.string().trim().min(1).max(8000),
  action: z.enum(["message", "confirm", "correct", "cancel"]).default("message"),
});
