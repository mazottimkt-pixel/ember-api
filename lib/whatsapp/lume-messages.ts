import { formatBRL } from "@/lib/domain/calculations";

export const LUME_SIGNATURE = "*Lume • IA*";

export function formatLumeMessage(message: string) {
  const content = message.replace(/\r\n/g, "\n").trim();
  if (!content) return `${LUME_SIGNATURE}\n\n${lumeMessages.generalFailure}`;
  if (content === LUME_SIGNATURE || content.startsWith(`${LUME_SIGNATURE}\n`)) return content;
  return `${LUME_SIGNATURE}\n\n${content}`;
}

export const lumeButtons = {
  confirmation: [
    { id: "confirm_document", label: "Emitir documento" },
    { id: "correct_document", label: "Corrigir informações" },
    { id: "cancel_document", label: "Cancelar" },
  ],
  contactNotFound: [
    { id: "retry_contact", label: "Tentar outro nome" },
    { id: "cancel", label: "Cancelar" },
  ],
  pdfRetry: [{ id: "retry_pdf", label: "Gerar PDF" }],
  brandingOffer: [
    { id: "customize_documents_now", label: "Personalizar documentos" },
    { id: "configure_documents_later", label: "Agora não" },
  ],
  brandingLogo: [{ id: "continue_without_logo", label: "Continuar sem logo" }, { id: "cancel_branding_setup", label: "Cancelar configuração" }],
  brandingTemplates: [
    { id: "template_essential", label: "Essencial" }, { id: "template_executive", label: "Executivo" },
    { id: "template_contemporary", label: "Contemporâneo" }, { id: "template_commercial", label: "Comercial" },
  ],
  brandingApproval: [{ id: "approve_document_branding", label: "Aprovar" }, { id: "adjust_document_branding", label: "Ajustar" }, { id: "use_default_document_style", label: "Usar modelo padrão" }],
} as const;

export const lumeMessages = {
  opening: "Olá! O que você precisa hoje?\n\nPosso ajudar com documentos, orçamentos, pedidos, informações da sua empresa e outras rotinas administrativas. É só me dizer o que precisa.",
  customer: "Vamos começar pelo cliente.\n\nQual é o nome ou a razão social?",
  supplier: "Vamos começar pelo fornecedor.\n\nQual é o nome ou a razão social?",
  item: "Agora me informe o item que deseja adicionar.\n\nPode enviar o produto ou serviço, a quantidade e o valor unitário em uma única mensagem.\n\nExemplo: Consultoria financeira, 2 unidades, R$ 500 cada.",
  deadline: "Em quanto tempo o serviço deverá ser executado após a aprovação?",
  purchaseOrderDeadline: "Qual é o prazo previsto para entrega?",
  payment: "Como será realizado o pagamento?\n\nVocê pode responder, por exemplo: à vista, 50% de entrada ou parcelado em 3 vezes.",
  validity: "Por quantos dias este orçamento deverá permanecer válido?\n\nVocê também pode informar uma data, como “10/08/2026”.",
  address: "Qual é o endereço completo para entrega?\n\nInclua rua, número, complemento, bairro, cidade e CEP, quando disponíveis.",
  search: "Qual documento você deseja localizar?\n\nPode enviar o número, o nome do cliente ou fornecedor, ou outra informação relacionada.",
  correction: "Claro. Qual informação deseja corrigir e qual é o novo valor?\n\nOs demais dados serão mantidos.\n\nExemplo: alterar o prazo para 15 dias.",
  cancelled: "Tudo certo. A operação foi cancelada e nenhum documento foi criado.",
  alreadyConfirmed: "Este documento já foi criado e confirmado anteriormente.\n\nVou reutilizar a versão existente para evitar duplicidades.",
  retryPdf: "Encontrei o documento confirmado. Vou reenviar o PDF para você.",
  integrityChanged: "Identifiquei uma alteração nas informações desde o último resumo.\n\nPara sua segurança, preparei uma versão atualizada para uma nova conferência.",
  summaryMissing: "Antes da confirmação, preciso apresentar o resumo completo do documento.\n\nRevise as informações abaixo:",
  summaryClosing: "Confira as informações com atenção.\n\nPosso emitir o documento com esses dados? Você também pode me dizer diretamente o que deseja corrigir.",
  pdfFailure: "O documento foi criado e confirmado com segurança, mas não consegui preparar o PDF neste momento.\n\nNenhuma informação foi perdida. Envie *Gerar PDF* para tentar novamente.",
  documentCreationFailure: "Não consegui criar o pedido de compra.\n\nNenhum documento foi gerado.\n\nSeus dados foram preservados.",
  generalFailure: "Esta etapa não respondeu neste momento. Nenhuma ação foi concluída e seus dados foram preservados.\n\nVocê pode reenviar a última mensagem ou explicar como deseja continuar.",
  options: "Como deseja continuar?",
  confirmationButtonsUnavailable: "Para continuar, responda com uma das opções:\n\n1 — Confirmar\n2 — Corrigir\n3 — Cancelar",
  noSearchResults: "Não encontrei nenhum documento com as informações enviadas.\n\nConfira o número ou tente buscar pelo nome do cliente ou fornecedor.",
  audioEmpty: "Não consegui compreender o conteúdo do áudio.\n\nVocê pode enviar outro áudio ou digitar a mensagem.",
  audioTooLarge: "O áudio enviado é maior do que o limite permitido.\n\nEnvie um áudio mais curto ou digite a mensagem.",
  audioInvalid: "Não consegui processar esse formato de áudio.\n\nEnvie outro áudio ou digite a mensagem.",
  contactNotFound: "Não encontrei esse cliente ou fornecedor no cadastro.\n\nConfira o nome ou tente buscar de outra forma.",
  ambiguousContact: "Encontrei mais de um cadastro com esse nome.\n\nEnvie uma informação adicional para eu identificar o contato correto.",
  processing: "Tudo certo. Estou criando o documento e preparando o PDF.\n\nIsso pode levar alguns segundos.",
  fileNotFound: "Não encontrei esse documento entre os arquivos disponíveis.\n\nVocê pode enviá-lo aqui para que eu consiga guardá-lo e localizar depois.",
  informationNotFound: "Não encontrei essa informação nos registros disponíveis.\n\nVocê pode me enviar o dado ou o documento para que eu consiga organizá-lo.",
  uncertainIntent: "Não consegui confirmar o que você precisa com segurança. Pode me passar mais um detalhe? Se preferir descobrir as possibilidades, peça o Menu de soluções.",
  invalidPromptOption: "Não consegui relacionar essa resposta à decisão atual. Pode responder com uma das alternativas apresentadas ou explicar com suas palavras?",
  brandingOffer: "Quer que eu deixe os próximos documentos com a identidade da sua empresa?",
  brandingLogo: "Envie o logotipo da sua empresa.\n\nVocê também pode continuar sem logotipo.",
  brandingTemplate: "Qual estilo combina mais com a sua empresa?\n\nEscolha uma das opções abaixo:",
  brandingColor: "Qual cor principal deseja utilizar nos seus documentos?\n\nVocê pode enviar o nome da cor ou um código hexadecimal, como #1F3A5F.",
  brandingPreview: "Preparei uma prévia com a identidade da sua empresa.\n\nDeseja utilizar este visual como padrão?",
  brandingApproved: "Sua identidade visual foi configurada.\n\nOs próximos documentos serão gerados com:\n\n• modelo {modelo};\n• logotipo da empresa, quando enviado;\n• cor principal da marca;\n• dados comerciais cadastrados.\n\nVocê poderá alterar essa configuração quando desejar.",
  brandingDefault: "Certo. Usarei o modelo padrão neste documento.\n\nVamos continuar.",
  brandingLater: "Tudo bem. Você poderá personalizar seus documentos depois.\n\nPor enquanto, usarei o modelo padrão.",
  brandingCurrent: "Encontrei a identidade visual utilizada atualmente.\n\nO que deseja alterar?",
} as const;

const fieldLabels: Record<string, string> = {
  documentType: "tipo do documento", type: "tipo do documento",
  counterpartyName: "nome do cliente ou fornecedor", items: "itens",
  quantity: "quantidade", unit: "unidade", unitPrice: "valor unitário",
  unit_price: "valor unitário", discount: "desconto", shipping: "frete ou acréscimo",
  freight: "frete ou acréscimo", paymentTerms: "condição de pagamento",
  deadline: "prazo de entrega ou execução", deliveryTerms: "prazo de entrega ou execução",
  validity: "validade", validityDate: "validade", deliveryAddress: "endereço de entrega",
  notes: "observações", documentQuery: "informações do documento",
};

export function friendlyFieldName(path: string) {
  const item = /^items\[(\d+)\](?:\.(.+))?$/.exec(path);
  if (item) {
    const suffix = item[2] ? fieldLabels[item[2]] ?? "informação" : "item";
    return `${suffix} do item ${Number(item[1]) || 1}`;
  }
  const key = path.split(".").at(-1) ?? path;
  return fieldLabels[path] ?? fieldLabels[key] ?? "essa informação";
}

export function ambiguousInformation(field: string) {
  const friendly = friendlyFieldName(field);
  if (friendly === "essa informação") return lumeMessages.uncertainIntent;
  return `Não consegui interpretar essa informação com segurança.\n\nPode me confirmar ${friendly}?`;
}

export function changedFields(fields: string[]) {
  const list = fields.map((field) => `• ${friendlyFieldName(field)}`).join("\n");
  return `Algumas informações foram alteradas desde a última revisão:\n\n${list}\n\nPara sua segurança, confira o resumo atualizado antes de confirmar.`;
}

export function documentCreated(number: string, type?: "quote" | "purchase_order", total?: number) {
  const label = type === "purchase_order" ? "Pedido de compra" : type === "quote" ? "Orçamento" : "Documento";
  return `${label} criado com sucesso.\n\nNúmero: *${number}*${typeof total === "number" ? `\nTotal: ${formatBRL(total)}` : ""}\n\nVou encaminhar o PDF abaixo.`;
}

export function documentPdfFailed(number?: string) {
  return `O pedido de compra foi criado, mas não consegui preparar o PDF neste momento.${number ? `\n\nNúmero do pedido: *${number}*` : ""}\n\nVocê pode tentar *Gerar PDF* novamente.`;
}

export function documentCaption(type: "quote" | "purchase_order", number: string) {
  return `${type === "quote" ? "Orçamento" : "Pedido de compra"} ${number} • Gerado pela Lume`;
}

type SearchDocument = { number?: unknown; type?: unknown; status?: unknown; total?: unknown; created_at?: unknown; counterparty_snapshot?: unknown };
export function searchResults(input: unknown[]) {
  const documents = input.map((document) => document && typeof document === "object" ? document as SearchDocument : {});
  if (!documents.length) return lumeMessages.noSearchResults;
  const intro = documents.length === 1
    ? "Encontrei 1 documento correspondente à sua busca."
    : `Encontrei ${documents.length} documentos correspondentes à sua busca.\n\nVou apresentar os resultados para você escolher.`;
  const rows = documents.map((document, index) => {
    const party = document.counterparty_snapshot && typeof document.counterparty_snapshot === "object"
      ? String((document.counterparty_snapshot as Record<string, unknown>).name ?? "Não informado") : "Não informado";
    const type = document.type === "purchase_order" ? "Pedido de compra" : "Orçamento";
    const date = typeof document.created_at === "string" ? new Intl.DateTimeFormat("pt-BR").format(new Date(document.created_at)) : "Não informada";
    const total = typeof document.total === "number" ? formatBRL(document.total) : "Não informado";
    return `${index + 1}. *${String(document.number ?? "Sem número")}*\nTipo: ${type}\nCliente ou fornecedor: ${party}\nData: ${date}\nStatus: ${String(document.status ?? "Não informado")}\nValor total: ${total}`;
  });
  return `${intro}\n\n${rows.join("\n\n")}`;
}

export function friendlyError(code: string) {
  const messages: Record<string, string> = {
    CONTACT_NOT_FOUND: lumeMessages.contactNotFound,
    AMBIGUOUS_CONTACT: lumeMessages.ambiguousContact,
    WHATSAPP_AUDIO_TOO_LARGE: lumeMessages.audioTooLarge,
    WHATSAPP_AUDIO_TYPE_INVALID: lumeMessages.audioInvalid,
    WHATSAPP_AUDIO_EMPTY: lumeMessages.audioEmpty,
    WHATSAPP_MESSAGE_WITHOUT_TEXT: lumeMessages.audioEmpty,
    DRAFT_CREATE_FAILED: lumeMessages.documentCreationFailure,
  };
  return messages[code] ?? lumeMessages.generalFailure;
}
