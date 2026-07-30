import type { ChannelAdapter, NormalizedInbound, NormalizedOutbound } from "./contracts";

export type FutureWhatsAppInput = { externalMessageId: string; externalConversationId: string; organizationId: string; kind: "text" | "audio" | "button" | "document" | "status"; text?: string; mediaReference?: string; buttonId?: string; receivedAt: string };

export class WhatsAppChannelAdapter implements ChannelAdapter<FutureWhatsAppInput> {
  readonly name = "whatsapp" as const;
  normalize(input: FutureWhatsAppInput): NormalizedInbound { return { channel: this.name, ...input, metadata: {} }; }
  async deliver(output: NormalizedOutbound): Promise<{ externalMessageId: string }> {
    void output;
    throw new Error("WHATSAPP_CHANNEL_NOT_CONFIGURED");
  }
}
