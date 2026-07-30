import type { AgentState } from "@/lib/ai/contracts";
import { normalizedInboundSchema, normalizedOutboundSchema, type NormalizedInbound } from "./contracts";

export function normalizeAgentLabInput(input: { organizationId: string; userId: string; idempotencyKey: string; conversationId?: string; text: string }) {
  return normalizedInboundSchema.parse({
    channel: "agent-lab", externalMessageId: `lab:${input.organizationId}:${input.idempotencyKey}`,
    externalConversationId: input.conversationId, organizationId: input.organizationId, actorId: input.userId,
    kind: "text", text: input.text, receivedAt: new Date().toISOString(), metadata: {},
  });
}

export function agentResultToOutbound(input: NormalizedInbound, result: { conversationId: string; reply: string; state: AgentState; pdfUrl?: string }) {
  return normalizedOutboundSchema.parse({ channel: "agent-lab", conversationId: result.conversationId,
    kind: result.pdfUrl ? "document" : "text", text: result.reply, mediaReference: result.pdfUrl,
    replyToExternalMessageId: input.externalMessageId, metadata: { state: result.state } });
}
