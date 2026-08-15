import type { AgentState } from "@/lib/ai/contracts";
import type { NormalizedInbound, NormalizedOutbound } from "@/lib/channels/contracts";
import { documentCaption, documentPdfFailed, formatLumeMessage, friendlyError, lumeButtons, lumeMessages } from "./lume-messages";

export const WHATSAPP_FRIENDLY_FALLBACK = lumeMessages.generalFailure;

export function whatsappConversationKey(phoneNumberId: string, senderId: string) {
  return `whatsapp:${phoneNumberId}:${senderId}`;
}

export function agentActionForInbound(message: NormalizedInbound) {
  const command = (message.buttonId ?? message.text ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
  const actions: Record<string, "confirm" | "correct" | "cancel" | "retry_pdf" | "create_quote" | "create_purchase_order" | "search_document" | "retry_contact" | "configure_branding" | "customize_documents_now" | "emit_default_document" | "use_default_document_style" | "configure_documents_later" | "continue_without_logo" | "cancel_branding_setup" | "template_essential" | "template_executive" | "template_contemporary" | "template_commercial" | "approve_document_branding" | "adjust_document_branding"> = {
    confirm: "confirm", confirm_document: "confirm", confirmar: "confirm", "pode emitir": "confirm", "pode gerar": "confirm", "pode confirmar": "confirm", "tudo correto": "confirm", "esta certo": "confirm", confirmado: "confirm", manda: "confirm", sim: "confirm",
    correct: "correct", correct_document: "correct", corrigir: "correct",
    cancel: "cancel", cancel_document: "cancel", cancelar: "cancel",
    retry_pdf: "retry_pdf", "gerar pdf": "retry_pdf", "reenviar pdf": "retry_pdf", "tentar pdf novamente": "retry_pdf",
    create_quote: "create_quote", "criar orcamento": "create_quote", orcamento: "create_quote", "fazer orcamento": "create_quote", "novo orcamento": "create_quote",
    create_purchase_order: "create_purchase_order", "criar pedido": "create_purchase_order", pedido: "create_purchase_order", "pedido de compra": "create_purchase_order", "novo pedido": "create_purchase_order",
    search_document: "search_document", "consultar documento": "search_document", "buscar documento": "search_document", "localizar documento": "search_document",
    retry_contact: "retry_contact", "tentar outro nome": "retry_contact",
    configure_branding: "configure_branding", "configurar identidade visual": "configure_branding", "personalizar documentos": "configure_branding", "alterar modelo": "configure_branding", "trocar logo": "configure_branding", "mudar cor dos documentos": "configure_branding", "editar identidade do pdf": "configure_branding",
    customize_documents_now: "customize_documents_now", "personalizar agora": "customize_documents_now",
    personalize_now: "customize_documents_now", "gostaria sim": "customize_documents_now", "vamos personalizar": "customize_documents_now", "pode colocar minha logo": "customize_documents_now",
    emit_default_document: "emit_default_document", "emitir com modelo padrao": "emit_default_document", "pode ser padrao": "emit_default_document", "gera assim mesmo": "emit_default_document", "nao precisa da logo": "emit_default_document", "pode emitir sem logo": "emit_default_document",
    use_default_document_style: "use_default_document_style", "usar modelo padrao": "use_default_document_style",
    configure_documents_later: "configure_documents_later", "configurar depois": "configure_documents_later",
    not_now: "configure_documents_later", "agora nao": "configure_documents_later",
    continue_without_logo: "continue_without_logo", "continuar sem logo": "continue_without_logo",
    cancel_branding_setup: "cancel_branding_setup", "cancelar configuracao": "cancel_branding_setup",
    template_essential: "template_essential", essencial: "template_essential",
    template_executive: "template_executive", executivo: "template_executive",
    template_contemporary: "template_contemporary", contemporaneo: "template_contemporary",
    template_commercial: "template_commercial", comercial: "template_commercial",
    approve_document_branding: "approve_document_branding", aprovar: "approve_document_branding",
    adjust_document_branding: "adjust_document_branding", ajustar: "adjust_document_branding",
  };
  return actions[command] ?? "message" as const;
}

export function splitWhatsAppText(text: string, maxLength = 1200) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [WHATSAPP_FRIENDLY_FALLBACK];
  if (normalized.length <= maxLength) return [normalized];

  const chunks: string[] = [];
  let current = "";
  const parts = normalized.split(/(?<=\.)\s+|\n{2,}/);
  const push = (value: string) => {
    const trimmed = value.trim();
    if (trimmed) chunks.push(trimmed);
  };

  for (const part of parts) {
    if (part.length > maxLength) {
      push(current);
      current = "";
      for (let index = 0; index < part.length; index += maxLength)
        push(part.slice(index, index + maxLength));
      continue;
    }
    const candidate = current ? `${current}\n\n${part}` : part;
    if (candidate.length > maxLength) {
      push(current);
      current = part;
    } else current = candidate;
  }
  push(current);
  return chunks;
}

type AgentBridgeResult = {
  reply: string;
  state: AgentState;
  documentId?: string;
  draft?: { type?: "quote" | "purchase_order" | "document_search" | null };
  collection?: { activePrompt?: { options: Array<{ id: string; label: string; number: number }> }; branding?: { preEmission?: boolean } };
};

export function withPdfDeliveryOutcome<T extends AgentBridgeResult>(result: T, pdfError?: string): T {
  if (!pdfError) return result;
  return {
    ...result,
    reply: documentPdfFailed(/\b(?:PC|ORC)-\d{4}-\d{6}\b/.exec(result.reply)?.[0]),
  };
}

export function buildAgentWhatsAppOutputs(
  message: NormalizedInbound,
  result: AgentBridgeResult,
  pdfReference?: { url: string; filename: string },
) {
  const outputs: NormalizedOutbound[] = splitWhatsAppText(result.reply).map(
    (text) => ({
      channel: "whatsapp",
      conversationId: message.externalConversationId!,
      kind: "text",
      text: formatLumeMessage(text),
      replyToExternalMessageId: message.externalMessageId,
      metadata: { state: result.state },
    }),
  );

  if (result.state === "awaiting_confirmation" && !result.collection?.branding?.preEmission)
    outputs[outputs.length - 1].buttons = [...lumeButtons.confirmation];

  const promptOptions=result.collection?.activePrompt?.options;
  if(promptOptions&&promptOptions.length>3)outputs[outputs.length-1].list={buttonLabel:"Ver opções",sections:[{title:"Escolha uma opção",rows:promptOptions.slice(0,10).map(option=>({id:option.id,title:option.label.slice(0,24)}))}]};
  else if(promptOptions?.length&&!outputs[outputs.length-1].buttons)outputs[outputs.length-1].buttons=promptOptions.map(option=>({id:option.id,label:option.label}));

  if (result.reply.includes(lumeMessages.brandingOffer)) outputs[outputs.length - 1].buttons = [...lumeButtons.brandingOffer];
  if (result.reply === lumeMessages.brandingLogo) outputs[outputs.length - 1].buttons = [...lumeButtons.brandingLogo];
  if (result.reply === lumeMessages.brandingPreview) outputs[outputs.length - 1].buttons = [...lumeButtons.brandingApproval];

  if (result.reply === lumeMessages.contactNotFound)
    outputs[outputs.length - 1].buttons = [...lumeButtons.contactNotFound];

  if (result.state === "confirmed" && result.reply.includes("não consegui preparar o PDF"))
    outputs[outputs.length - 1].buttons = [...lumeButtons.pdfRetry];

  if (result.state === "confirmed" && pdfReference)
    outputs.push({
      channel: "whatsapp",
      conversationId: message.externalConversationId!,
      kind: "document",
      text: documentCaption(result.draft?.type === "purchase_order" ? "purchase_order" : "quote", pdfReference.filename.replace(/\.pdf$/i, "")),
      mediaReference: pdfReference.url,
      metadata: {
        state: result.state,
        documentId: result.documentId,
        filename: pdfReference.filename,
      },
    });

  return outputs;
}

export function buildWhatsAppFallback(message: NormalizedInbound) {
  return {
    channel: "whatsapp" as const,
    conversationId: message.externalConversationId!,
    kind: "text" as const,
    text: formatLumeMessage(WHATSAPP_FRIENDLY_FALLBACK),
    replyToExternalMessageId: message.externalMessageId,
    metadata: { friendlyErrorType: "GENERAL_FAILURE", messageSignatureApplied: true },
  };
}

export function buildWhatsAppError(message: NormalizedInbound, code: string, state?: AgentState) {
  const text = friendlyError(code);
  const output: NormalizedOutbound = {
    channel: "whatsapp", conversationId: message.externalConversationId!, kind: "text",
    text: formatLumeMessage(text), replyToExternalMessageId: message.externalMessageId,
    metadata: { state, friendlyErrorType: code, messageSignatureApplied: true },
  };
  if (code === "CONTACT_NOT_FOUND" || code === "AMBIGUOUS_CONTACT") output.buttons = [...lumeButtons.contactNotFound];
  else if (["DRAFT_CREATE_FAILED", "ITEM_CREATE_FAILED", "NUMBER_FAILED", "CONFIRM_FAILED", "BRANDING_SAVE_FAILED"].includes(code))
    output.buttons = [{ id: "confirm_document", label: "Tentar emitir novamente" }, { id: "correct_document", label: "Corrigir informações" }];
  return output;
}
