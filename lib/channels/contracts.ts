import { z } from "zod";

export const channelMessageKindSchema = z.enum(["text", "audio", "button", "document", "image", "status"]);
export const channelProcessingStatusSchema = z.enum(["received", "processing", "responded", "failed"]);
export const channelNameSchema = z.enum(["agent-lab", "whatsapp"]);

export const normalizedInboundSchema = z.object({
  channel: channelNameSchema,
  externalMessageId: z.string().trim().min(1).max(255),
  externalConversationId: z.string().trim().min(1).max(255).optional(),
  organizationId: z.uuid(),
  actorId: z.uuid().optional(),
  kind: channelMessageKindSchema,
  text: z.string().trim().max(8000).optional(),
  mediaReference: z.string().trim().max(1000).optional(),
  buttonId: z.string().trim().max(160).optional(),
  receivedAt: z.iso.datetime(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const normalizedOutboundSchema = z.object({
  channel: channelNameSchema,
  conversationId: z.string().trim().min(1),
  kind: channelMessageKindSchema,
  text: z.string().trim().max(8000).optional(),
  mediaReference: z.string().trim().max(1000).optional(),
  buttons: z.array(z.object({ id: z.string().max(160), label: z.string().max(80) })).max(3).optional(),
  list: z.object({ buttonLabel: z.string().trim().max(20), sections: z.array(z.object({ title: z.string().trim().max(24), rows: z.array(z.object({ id: z.string().max(160), title: z.string().trim().max(24), description: z.string().trim().max(72).optional() })).min(1).max(10) })).min(1).max(10) }).optional(),
  replyToExternalMessageId: z.string().trim().max(255).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type NormalizedInbound = z.infer<typeof normalizedInboundSchema>;
export type NormalizedOutbound = z.infer<typeof normalizedOutboundSchema>;
export type ChannelProcessingStatus = z.infer<typeof channelProcessingStatusSchema>;

export interface ChannelAdapter<TInput = unknown> {
  readonly name: z.infer<typeof channelNameSchema>;
  normalize(input: TInput): Promise<NormalizedInbound> | NormalizedInbound;
  deliver(output: NormalizedOutbound): Promise<{ externalMessageId: string }>;
}
