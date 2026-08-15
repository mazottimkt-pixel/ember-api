import "server-only";
import { z } from "zod";
import { normalizedInboundSchema, normalizedOutboundSchema, type ChannelAdapter, type NormalizedInbound, type NormalizedOutbound } from "./contracts";
import { isAuthorizedWhatsAppRecipient } from "./whatsapp-recipient";
import { formatLumeMessage, lumeMessages } from "@/lib/whatsapp/lume-messages";

const graphErrorSchema = z.object({ error: z.object({ message: z.string().optional(), type: z.string().optional(), code: z.number().optional(), error_subcode: z.number().optional(), is_transient: z.boolean().optional() }) });
const sendResultSchema = z.object({ messages: z.array(z.object({ id: z.string() })).min(1) });
const mediaResultSchema = z.object({ url: z.url(), mime_type: z.string().optional(), file_size: z.number().optional() });

export type WhatsAppStatus = "sent" | "delivered" | "read" | "failed" | "deleted";
const whatsappStatuses = new Set<WhatsAppStatus>(["sent", "delivered", "read", "failed", "deleted"]);
const statusRank: Record<WhatsAppStatus, number> = { sent: 1, delivered: 2, read: 3, failed: 4, deleted: 4 };
export const shouldAdvanceWhatsAppStatus = (current: WhatsAppStatus | null | undefined, next: WhatsAppStatus) => !current || statusRank[next] >= statusRank[current];
export function isConfirmationButtonFallback(output: NormalizedOutbound) {
  const ids = (output.buttons ?? []).map((button) => button.id);
  return output.metadata.state === "awaiting_confirmation" && output.kind === "text" && ids.join(",") === "confirm_document,correct_document,cancel_document";
}
const hasConfirmationButtonSet = (output: NormalizedOutbound) => (output.buttons ?? []).map((button) => button.id).join(",") === "confirm_document,correct_document,cancel_document";
export type ParsedWhatsAppEvent = {
  phoneNumberId: string; businessAccountId?: string; externalMessageId: string; externalConversationId: string;
  kind: "text" | "audio" | "button" | "document" | "image" | "status"; text?: string; mediaReference?: string;
  buttonId?: string; receivedAt: string; status?: WhatsAppStatus; recipientId?: string; metadata: Record<string, unknown>;
};
export type WhatsAppNormalizeInput = { event: ParsedWhatsAppEvent; organizationId: string; actorId?: string };

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
export class MetaApiError extends Error {
  constructor(readonly status: number, readonly code?: number, readonly transient = false) { super("META_API_ERROR"); this.name = "MetaApiError"; }
  get retryable() { return this.transient || RETRYABLE_STATUS.has(this.status); }
  get sanitizedType() {
    if (this.code === 130497) return "GEOGRAPHIC_RESTRICTION";
    if (this.code === 190 || this.status === 401) return "INVALID_TOKEN";
    if (this.code === 10 || this.code === 200 || this.status === 403) return "INSUFFICIENT_PERMISSION";
    if (this.code === 131030) return "RECIPIENT_NOT_ALLOWED";
    if (this.code === 131047) return "CONVERSATION_WINDOW_CLOSED";
    if (this.retryable) return "TEMPORARY_META_FAILURE";
    return "META_REQUEST_REJECTED";
  }
}

function unixToIso(value: unknown) {
  const timestamp = typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(timestamp) ? new Date(timestamp * 1000).toISOString() : new Date().toISOString();
}

export function parseWhatsAppWebhook(payload: unknown): ParsedWhatsAppEvent[] {
  const root = z.object({ entry: z.array(z.object({ id: z.string().optional(), changes: z.array(z.object({ field: z.string(), value: z.record(z.string(), z.unknown()) })) })) }).safeParse(payload);
  if (!root.success) return [];
  const events: ParsedWhatsAppEvent[] = [];
  for (const entry of root.data.entry) for (const change of entry.changes) {
    if (change.field !== "messages") continue;
    const value = change.value;
    const metadata = value.metadata as Record<string, unknown> | undefined;
    const phoneNumberId = typeof metadata?.phone_number_id === "string" ? metadata.phone_number_id : "";
    if (!phoneNumberId) continue;
    const messages = Array.isArray(value.messages) ? value.messages as Record<string, unknown>[] : [];
    for (const message of messages) {
      const id = typeof message.id === "string" ? message.id : "";
      const from = typeof message.from === "string" ? message.from : "";
      const type = typeof message.type === "string" ? message.type : "";
      if (!id || !from) continue;
      const base = { phoneNumberId, businessAccountId: entry.id, externalMessageId: id, externalConversationId: from, receivedAt: unixToIso(message.timestamp), metadata: { whatsappType: type } };
      if (type === "text" && message.text && typeof message.text === "object") {
        const body = (message.text as Record<string, unknown>).body;
        if (typeof body === "string") events.push({ ...base, kind: "text", text: body });
      } else if (type === "audio" && message.audio && typeof message.audio === "object") {
        const audio = message.audio as Record<string, unknown>;
        if (typeof audio.id === "string") events.push({ ...base, kind: "audio", mediaReference: audio.id, metadata: { ...base.metadata, mimeType: audio.mime_type, voice: audio.voice } });
      } else if (type === "image" && message.image && typeof message.image === "object") {
        const image = message.image as Record<string, unknown>;
        if (typeof image.id === "string") events.push({ ...base, kind: "image", mediaReference: image.id, text: typeof image.caption === "string" ? image.caption : undefined, metadata: { ...base.metadata, mimeType: image.mime_type, filename: image.filename } });
      } else if (type === "interactive" && message.interactive && typeof message.interactive === "object") {
        const interactive = message.interactive as Record<string, unknown>;
        const reply = (interactive.button_reply ?? interactive.list_reply) as Record<string, unknown> | undefined;
        if (typeof reply?.id === "string") events.push({ ...base, kind: "button", buttonId: reply.id, text: typeof reply.title === "string" ? reply.title : undefined });
      } else if (type === "button" && message.button && typeof message.button === "object") {
        const button = message.button as Record<string, unknown>;
        if (typeof button.payload === "string") events.push({ ...base, kind: "button", buttonId: button.payload, text: typeof button.text === "string" ? button.text : undefined });
      } else if (type === "document" && message.document && typeof message.document === "object") {
        const document = message.document as Record<string, unknown>;
        if (typeof document.id === "string") events.push({ ...base, kind: "document", mediaReference: document.id, text: typeof document.caption === "string" ? document.caption : undefined, metadata: { ...base.metadata, mimeType: document.mime_type, filename: document.filename } });
      }
    }
    const statuses = Array.isArray(value.statuses) ? value.statuses as Record<string, unknown>[] : [];
    for (const status of statuses) {
      if (typeof status.id !== "string" || typeof status.status !== "string" || !whatsappStatuses.has(status.status as WhatsAppStatus)) continue;
      const recipientId = typeof status.recipient_id === "string" ? status.recipient_id : status.id;
      events.push({ phoneNumberId, businessAccountId: entry.id, externalMessageId: `status:${status.id}:${status.status}`, externalConversationId: recipientId,
        kind: "status", status: status.status as WhatsAppStatus, recipientId, receivedAt: unixToIso(status.timestamp), metadata: { targetMessageId: status.id, errors: Array.isArray(status.errors) ? status.errors.map((item) => typeof item === "object" && item ? (item as Record<string, unknown>).code : undefined).filter(Boolean) : [] } });
    }
  }
  return events;
}

export class WhatsAppChannelAdapter implements ChannelAdapter<WhatsAppNormalizeInput> {
  readonly name = "whatsapp" as const;
  private readonly accessToken: string; private readonly phoneNumberId: string; private readonly version: string;
  constructor(config: { accessToken?: string; phoneNumberId?: string; apiVersion?: string } = {}) {
    this.accessToken = config.accessToken ?? process.env.WHATSAPP_ACCESS_TOKEN ?? "";
    this.phoneNumberId = config.phoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
    this.version = config.apiVersion ?? process.env.WHATSAPP_API_VERSION ?? "v23.0";
  }
  normalize({ event, organizationId, actorId }: WhatsAppNormalizeInput): NormalizedInbound {
    const actionText = event.kind === "button" ? ({ confirm: "Confirmar", correct: "Corrigir", cancel: "Cancelar", retry_pdf: "Gerar PDF", retry_contact: "Tentar outro nome", create_quote: "Criar orçamento", create_purchase_order: "Criar pedido", search_document: "Consultar documento", customize_documents_now: "Personalizar agora", use_default_document_style: "Usar modelo padrão", configure_documents_later: "Configurar depois", continue_without_logo: "Continuar sem logo", cancel_branding_setup: "Cancelar configuração", approve_document_branding: "Aprovar", adjust_document_branding: "Ajustar" }[event.buttonId ?? ""] ?? event.text) : event.text;
    return normalizedInboundSchema.parse({ channel: this.name, externalMessageId: event.externalMessageId, externalConversationId: event.externalConversationId,
      organizationId, actorId, kind: event.kind, text: actionText, mediaReference: event.mediaReference, buttonId: event.buttonId,
      receivedAt: event.receivedAt, metadata: { ...event.metadata, phoneNumberId: event.phoneNumberId, status: event.status, recipientId: event.recipientId } });
  }
  private async graph(path: string, init: RequestInit = {}) {
    if (!this.accessToken || !this.phoneNumberId) throw new Error("WHATSAPP_CHANNEL_NOT_CONFIGURED");
    const response = await fetch(`https://graph.facebook.com/${this.version}/${path}`, { ...init, headers: { Authorization: `Bearer ${this.accessToken}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers } });
    if (!response.ok) {
      const parsed = graphErrorSchema.safeParse(await response.json().catch(() => null));
      throw new MetaApiError(response.status, parsed.success ? parsed.data.error.code : undefined, parsed.success ? parsed.data.error.is_transient : false);
    }
    return response;
  }
  async deliver(raw: NormalizedOutbound): Promise<{ externalMessageId: string; httpStatus: number; latencyMs: number; interactiveAttempted: boolean; interactiveSuccess: boolean; fallbackUsed: boolean }> {
    const output = normalizedOutboundSchema.parse(raw);
    const to = output.conversationId;
    if (!isAuthorizedWhatsAppRecipient(to, process.env.WHATSAPP_TEST_RECIPIENT))
      throw new Error("WHATSAPP_RECIPIENT_NOT_ALLOWED");
    if (!['text', 'document', 'image'].includes(output.kind)) throw new Error("WHATSAPP_OUTPUT_KIND_NOT_SUPPORTED");
    if (output.kind === "document" && !output.mediaReference) throw new Error("WHATSAPP_DOCUMENT_REFERENCE_REQUIRED");
    if (output.kind === "image" && !output.mediaReference) throw new Error("WHATSAPP_IMAGE_REFERENCE_REQUIRED");
    if ((output.buttons?.length || output.list) && output.kind !== "text") throw new Error("WHATSAPP_BUTTONS_REQUIRE_TEXT");
    if (output.buttons?.length && output.list) throw new Error("WHATSAPP_INTERACTIVE_MODE_CONFLICT");
    let message: Record<string, unknown>;
    if (output.kind === "document" && output.mediaReference) message = { messaging_product: "whatsapp", recipient_type: "individual", to, type: "document", document: { link: output.mediaReference, caption: output.text, filename: typeof output.metadata.filename === "string" ? output.metadata.filename : undefined } };
    else if (output.kind === "image" && output.mediaReference) message = { messaging_product: "whatsapp", recipient_type: "individual", to, type: "image", image: { link: output.mediaReference, caption: output.text } };
    else if (output.list) message = { messaging_product: "whatsapp", recipient_type: "individual", to, type: "interactive", interactive: { type: "list", body: { text: output.text ?? formatLumeMessage(lumeMessages.options) }, action: { button: output.list.buttonLabel, sections: output.list.sections } } };
    else if (output.buttons?.length) message = { messaging_product: "whatsapp", recipient_type: "individual", to, type: "interactive", interactive: { type: "button", body: { text: output.text ?? formatLumeMessage(lumeMessages.options) }, action: { buttons: output.buttons.map((button) => ({ type: "reply", reply: { id: button.id, title: button.label } })) } } };
    else message = { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body: output.text ?? formatLumeMessage(lumeMessages.generalFailure) } };
    let response: Response;
    const startedAt = performance.now();
    const interactiveAttempted = Boolean(output.buttons?.length || output.list);
    let fallbackUsed = false;
    const semanticButtonIds=output.buttons?.map((button)=>button.id)??output.list?.sections.flatMap((section)=>section.rows.map((row)=>row.id))??[];
    if (interactiveAttempted) console.info("whatsapp.interactive.delivery", { interactive_attempted: true, payload_type: output.list ? "interactive/list" : "interactive/button", semantic_button_ids:semanticButtonIds, graph_http_status:null,graph_error_code:null,interactive_success: false, fallback_used: false });
    try {
      response = await this.graph(`${this.phoneNumberId}/messages`, { method: "POST", body: JSON.stringify(message) });
      if (interactiveAttempted) console.info("whatsapp.interactive.delivery", { interactive_attempted: true,payload_type:output.list?"interactive/list":"interactive/button",semantic_button_ids:semanticButtonIds,graph_http_status:response.status,graph_error_code:null,interactive_success: true, fallback_used: false });
    }
    catch (error) {
      if ((!output.buttons?.length&&!output.list) || (error instanceof MetaApiError && error.retryable)) throw error;
      fallbackUsed = true;
      const choices=output.buttons??output.list!.sections.flatMap(section=>section.rows).map(row=>({id:row.id,label:[row.title,row.description].filter(Boolean).join(" — ")}));
      console.warn("whatsapp.interactive.delivery", { interactive_attempted: true,payload_type:output.list?"interactive/list":"interactive/button",semantic_button_ids:semanticButtonIds,graph_http_status:error instanceof MetaApiError?error.status:null,graph_error_code:error instanceof MetaApiError?error.code:null,interactive_success: false, fallback_used: true, state: output.metadata.state, fallback_reason: error instanceof MetaApiError ? error.sanitizedType : "INTERACTIVE_REJECTED" });
      const terminalOutput = output.metadata.state === "cancelled" || output.metadata.state === "confirmed";
      const fallback = terminalOutput
        ? output.text ?? formatLumeMessage(lumeMessages.generalFailure)
        : isConfirmationButtonFallback(output)
        ? formatLumeMessage(lumeMessages.confirmationButtonsUnavailable)
        : hasConfirmationButtonSet(output)
          ? output.text ?? formatLumeMessage(lumeMessages.generalFailure)
        : `${output.text ?? formatLumeMessage(lumeMessages.options)}\n\n${choices.map((button, index) => `${index + 1} — ${button.label}`).join("\n")}`;
      response = await this.graph(`${this.phoneNumberId}/messages`, { method: "POST", body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body: fallback } }) });
    }
    return { externalMessageId: sendResultSchema.parse(await response.json()).messages[0].id, httpStatus: response.status, latencyMs: Math.round(performance.now() - startedAt), interactiveAttempted, interactiveSuccess: interactiveAttempted && !fallbackUsed, fallbackUsed };
  }
  async downloadAudio(mediaId: string) {
    const metadataResponse = await this.graph(mediaId);
    const metadata = mediaResultSchema.parse(await metadataResponse.json());
    const maxBytes = Math.min(Math.max(Number(process.env.WHATSAPP_MAX_AUDIO_BYTES) || 10 * 1024 * 1024, 1024), 25 * 1024 * 1024);
    if (metadata.file_size && metadata.file_size > maxBytes) throw new Error("WHATSAPP_AUDIO_TOO_LARGE");
    const mediaResponse = await fetch(metadata.url, { headers: { Authorization: `Bearer ${this.accessToken}` } });
    if (!mediaResponse.ok) throw new MetaApiError(mediaResponse.status);
    const mimeType = (mediaResponse.headers.get("content-type") ?? metadata.mime_type ?? "").split(";")[0];
    const allowed = new Set(["audio/ogg", "audio/mpeg", "audio/mp4", "audio/aac", "audio/amr", "audio/opus", "audio/webm"]);
    if (!allowed.has(mimeType)) throw new Error("WHATSAPP_AUDIO_TYPE_INVALID");
    const bytes = new Uint8Array(await mediaResponse.arrayBuffer());
    if (!bytes.length || bytes.length > maxBytes) throw new Error("WHATSAPP_AUDIO_TOO_LARGE");
    return new File([bytes], `whatsapp-audio.${mimeType.split("/")[1] ?? "bin"}`, { type: mimeType });
  }
  async downloadBrandingLogo(mediaId: string) {
    const metadataResponse = await this.graph(mediaId);
    const metadata = mediaResultSchema.parse(await metadataResponse.json());
    if (metadata.file_size && metadata.file_size > 5 * 1024 * 1024) throw new Error("BRANDING_LOGO_TOO_LARGE");
    const mediaResponse = await fetch(metadata.url, { headers: { Authorization: `Bearer ${this.accessToken}` } });
    if (!mediaResponse.ok) throw new MetaApiError(mediaResponse.status);
    const mimeType = (mediaResponse.headers.get("content-type") ?? metadata.mime_type ?? "").split(";")[0];
    if (!['image/png', 'image/jpeg'].includes(mimeType)) throw new Error("BRANDING_LOGO_TYPE_INVALID");
    const bytes = new Uint8Array(await mediaResponse.arrayBuffer());
    return new File([bytes], `logo.${mimeType === "image/png" ? "png" : "jpg"}`, { type: mimeType });
  }
  async downloadAdministrativeMedia(mediaId: string, fallbackFilename = "arquivo") {
    const metadataResponse = await this.graph(mediaId);
    const metadata = mediaResultSchema.parse(await metadataResponse.json());
    const maxBytes = Math.min(Math.max(Number(process.env.LUME_FILE_MAX_SIZE_MB) || 10, 1), 25) * 1024 * 1024;
    if (metadata.file_size && metadata.file_size > maxBytes) throw new Error("ADMIN_FILE_TOO_LARGE");
    const mediaResponse = await fetch(metadata.url, { headers: { Authorization: `Bearer ${this.accessToken}` } });
    if (!mediaResponse.ok) throw new MetaApiError(mediaResponse.status);
    const mimeType = (mediaResponse.headers.get("content-type") ?? metadata.mime_type ?? "").split(";")[0];
    const bytes = new Uint8Array(await mediaResponse.arrayBuffer());
    if (!bytes.length || bytes.length > maxBytes) throw new Error(bytes.length ? "ADMIN_FILE_TOO_LARGE" : "ADMIN_FILE_EMPTY");
    return new File([bytes], fallbackFilename, { type: mimeType });
  }
}
