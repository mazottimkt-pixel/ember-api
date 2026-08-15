import { agentDraftSchema, emptyAgentDraft, type AgentDraft, type AgentState } from "./contracts";
import { getAgentAIProvider } from "./openai-provider";
import { locateMissingFields } from "./missing";
import { confirmAgentDocument, createAgentDraft, findContact, queryDocuments, type AgentToolContext } from "./tools";
import { asksForPreviousReason, parseQuoteValidity, validityErrorReply, type AgentCollectionContext } from "./validity";
import { AGENT_SUMMARY_VERSION, buildAgentReviewSummary, confirmationRequestId, differingAgentDraftFields, reviewMatchesDraft } from "./summary";
import { ambiguousInformation, changedFields, documentCreated, lumeMessages, searchResults } from "@/lib/whatsapp/lume-messages";
import { activeBranding, persistBranding } from "@/lib/branding/store";
import { normalizeBrandColor, templateNames, type DocumentTemplateId } from "@/lib/branding/identity";
import { normalizePaymentTerms, parsePaymentTerms } from "@/lib/domain/payment-terms";
import { applyEntitiesToAgentDraft, extractEntities } from "@/lib/orchestrator/entities";
import { counterpartyRoleConflict, expectedAnswerFor, explicitQuantityCorrection, parseCounterpartyAnswer, parseDeadlineAnswer, parseExplicitCorrection, parseItemBundle, paymentOnlyUpdate } from "./contextual-understanding";
import { extractCnpj } from "@/lib/domain/cnpj";
import { calculateDocument } from "@/lib/domain/calculations";

type CommercialEntity = { value: string | number | boolean; raw: string; source: "user_message"; confidence: number; normalized?: string; requiresConfirmation: boolean };
const understoodValue = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
function amountScopeLabels(description: string | null | undefined, quantity: number | null | undefined) {
  const words = (description ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return { unit: words[0].replace(/s$/i, "") || "unidade", total: quantity ? `dos ${quantity} ${words[0]}` : "do pedido" };
  return { unit: "unidade", total: quantity ? `dos ${quantity} itens` : "do pedido" };
}
function understoodCommercialData(entities: Record<string, CommercialEntity>, type: "quote" | "purchase_order", itemType?: AgentDraft["itemType"]) {
  const rows: string[] = [];
  if (entities.customer) rows.push(`${type === "purchase_order" ? "Fornecedor" : "Cliente"}: ${entities.customer.value}`);
  if (entities.service) rows.push(`${itemType === "product" ? "Produto" : itemType === "service" ? "Serviço" : "Produto ou serviço"}: ${entities.service.value}`);
  if (entities.quantity) rows.push(`Quantidade: ${entities.quantity.value}`);
  if (typeof entities.price?.value === "number") rows.push(`Valor informado: ${understoodValue(entities.price.value)}`);
  if (entities.payment_terms) rows.push(`Pagamento: ${normalizePaymentTerms(String(entities.payment_terms.value))}`);
  if (entities.validity) rows.push(`Validade: ${entities.validity.raw}`);
  return `Entendi estas informações:\n\n${rows.join("\n")}`;
}

const questions: Record<string, string> = {
  "tipo de documento": lumeMessages.opening, cliente: lumeMessages.customer,
  fornecedor: lumeMessages.supplier, itens: lumeMessages.item,
  prazo: lumeMessages.deadline, "condição de pagamento": lumeMessages.payment,
  validade: lumeMessages.validity, "endereço de entrega": lumeMessages.address,
  "termo da consulta": lumeMessages.search,
};
function questionFor(field: string, draft: AgentDraft) {
  if (field === "prazo" && draft.itemType === "product") return "Qual é o prazo de entrega?";
  if (field === "prazo" && draft.itemType === "service") return "Qual é o prazo de execução do serviço?";
  if (field === "prazo" && draft.type === "purchase_order") return lumeMessages.purchaseOrderDeadline;
  return questions[field] ?? ambiguousInformation(field);
}

function normalizeValidity(value: string | null, today?: string) {
  if (!value) return value;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const candidate = iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : value;
  const parsed = parseQuoteValidity(candidate, today);
  return parsed.success ? parsed.canonical : null;
}

function deliveryAddressWithoutPhone(value: string) {
  return value
    .replace(/(?:,|;|\s+-)?\s*(?:telefone|fone|celular|whatsapp|contato)\s*:?\s*(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}\b.*$/iu, "")
    .replace(/[\s,;-]+$/g, "").trim();
}

export function isLumeGreeting(value: string) {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return /^(?:ola|oi|bom dia|boa tarde|boa noite)(?: lume)?$/.test(normalized);
}

function freshOperationCollection(collection: AgentCollectionContext): AgentCollectionContext {
  return collection.branding ? { branding: collection.branding } : {};
}

export type AgentTurnInput = { action: "message" | "confirm" | "correct" | "cancel" | "retry_pdf" | "create_quote" | "create_purchase_order" | "search_document" | "retry_contact" | "configure_branding" | "customize_documents_now" | "emit_default_document" | "use_default_document_style" | "configure_documents_later" | "continue_without_logo" | "cancel_branding_setup" | "template_essential" | "template_executive" | "template_contemporary" | "template_commercial" | "approve_document_branding" | "adjust_document_branding"; text: string; idempotencyKey: string; state: AgentState; draft: AgentDraft; documentId?: string; collection?: AgentCollectionContext; today?: string };

export function shouldSendProcessingMessage(input: Pick<AgentTurnInput, "action" | "state" | "draft" | "documentId" | "collection">) {
  const party = input.collection?.party;
  const amountReady = input.draft.amountScope !== "amount_scope_pending" && (!input.draft.quotedAmount || input.draft.amountScope === "unit" || input.draft.amountScope === "total");
  return input.action === "confirm" && input.state === "awaiting_confirmation" && !input.documentId && amountReady && Boolean(party && !party.awaitingCnpj && !party.awaitingCnpjDecision && (party.source === "registered" || party.taxId || party.taxIdOmitted)) && reviewMatchesDraft(input.collection?.summary, input.draft, party?.taxId ?? null);
}

async function prepareParty(ctx: AgentToolContext, draft: AgentDraft, collection: AgentCollectionContext) {
  if ((draft.type !== "quote" && draft.type !== "purchase_order") || !draft.counterpartyName) return { collection, ready: false };
  if (collection.party?.name === draft.counterpartyName && !collection.party.awaitingCnpj && !collection.party.awaitingCnpjDecision)
    return { collection, ready: true };
  const contacts = await findContact(ctx, draft.counterpartyName, draft.type === "quote" ? "customer" : "supplier");
  if (contacts.length > 1) return { collection, ready: false, reply: lumeMessages.ambiguousContact };
  if (contacts.length === 1) return { collection: { ...collection, party: { source: "registered" as const, name: contacts[0].legal_name, contactId: contacts[0].id, taxId: contacts[0].tax_id ?? undefined } }, ready: true };
  return { collection: { ...collection, party: { source: "ad_hoc" as const, name: draft.counterpartyName, awaitingCnpjDecision: true } }, ready: false, reply: `Vou utilizar “${draft.counterpartyName}” neste documento.\n\nDeseja incluir o CNPJ?` };
}

export async function runAgentTurn(ctx: AgentToolContext, input: AgentTurnInput) {
  let { state, draft, documentId } = input;
  let collection = input.collection ?? {};
  let reply = ""; let provider = "server"; let documents: unknown[] | undefined;
  let metrics: ReturnType<NonNullable<import("./provider").AgentAIProvider["getLastMetrics"]>>;
  const reviewOrPartyQuestion = async (prefix?: string, validityFriendlyText?: string) => {
    const partyResult = await prepareParty(ctx, draft, collection);
    collection = partyResult.collection;
    if (!partyResult.ready)
      return { state: "collecting" as const, reply: [prefix, partyResult.reply].filter(Boolean).join("\n\n") };
    const summary = buildAgentReviewSummary(draft, { validityFriendlyText: validityFriendlyText ?? collection.validity?.friendlyText, partyTaxId: collection.party?.taxId ?? null });
    collection = { ...collection, summary, correctionRequested: false, pendingField: undefined };
    return { state: "awaiting_confirmation" as const, reply: [prefix, summary.text].filter(Boolean).join("\n\n") };
  };
  const terminalState = state === "cancelled" || state === "confirmed";
  if (terminalState && input.action === "message" && isLumeGreeting(input.text)) {
    return { state: "menu" as const, draft: emptyAgentDraft(), documentId: undefined, reply: lumeMessages.opening,
      provider, documents, metrics, collection: freshOperationCollection(collection) };
  }
  if (terminalState && ["create_quote", "create_purchase_order", "search_document"].includes(input.action)) {
    draft = emptyAgentDraft(); documentId = undefined; collection = freshOperationCollection(collection); state = "menu";
    if (input.action === "create_quote") draft = agentDraftSchema.parse({ ...draft, type: "quote" });
    if (input.action === "create_purchase_order") draft = agentDraftSchema.parse({ ...draft, type: "purchase_order" });
    if (input.action === "search_document") draft = agentDraftSchema.parse({ ...draft, type: "document_search" });
  }
  const resumeDocument = () => {
    const action = collection.branding?.resumeAction;
    collection = { ...collection, branding: undefined };
    if (action === "create_purchase_order") { draft = agentDraftSchema.parse({ ...draft, type: "purchase_order" }); return lumeMessages.supplier; }
    draft = agentDraftSchema.parse({ ...draft, type: "quote" }); return lumeMessages.customer;
  };
  if (input.action === "configure_branding") {
    const current = await activeBranding(ctx);
    collection = { ...collection, branding: { state: "offer" } };
    return { state, draft, documentId, reply: current ? lumeMessages.brandingCurrent : lumeMessages.brandingOffer, provider, documents, metrics, collection };
  }
  if (input.action === "customize_documents_now") {
    const preEmission=collection.branding?.preEmission;
    const afterSuccess=collection.branding?.afterSuccess;
    collection = { ...collection, branding: { ...collection.branding, state: "awaiting_logo" } };
    return { state, draft, documentId, reply: preEmission ? "Perfeito. Me envie a logo da sua empresa aqui mesmo. Assim que eu receber, preparo o documento com a sua identidade." : afterSuccess ? "Perfeito. Me envie a logo da sua empresa aqui mesmo. Pode enviar PNG ou JPG. Assim que eu receber, preparo sua identidade visual." : lumeMessages.brandingLogo, provider, documents, metrics, collection };
  }
  if ((input.action === "emit_default_document" || input.action === "use_default_document_style" || input.action === "continue_without_logo" || input.action === "cancel_branding_setup") && collection.branding?.preEmission) {
    await persistBranding(ctx, { status: "default" });
    collection = { ...collection, branding: undefined };
    return runAgentTurn(ctx, { ...input, action: "confirm", collection });
  }
  if(input.action==="message"&&collection.branding?.state==="awaiting_logo")return{state,draft,documentId,reply:collection.branding.afterSuccess?"Estou aguardando a logo em PNG ou JPG. O orçamento concluído permanece inalterado.":"Estou aguardando a logo em PNG ou JPG. Se preferir, diga “pode emitir sem logo” para usar o modelo padrão.",provider,documents,metrics,collection};
  if (input.action === "continue_without_logo") {
    collection = { ...collection, branding: { ...collection.branding, state: "awaiting_template", logoStoragePath: collection.branding?.logoStoragePath ?? null } };
    return { state, draft, documentId, reply: `${lumeMessages.brandingTemplate}\n\n1 — Essencial\n2 — Executivo\n3 — Contemporâneo\n4 — Comercial`, provider, documents, metrics, collection };
  }
  if (input.action.startsWith("template_")) {
    const templateId = input.action.replace("template_", "") as DocumentTemplateId;
    collection = { ...collection, branding: { ...collection.branding, state: "awaiting_color", templateId } };
    return { state, draft, documentId, reply: lumeMessages.brandingColor, provider, documents, metrics, collection };
  }
  if (input.action === "use_default_document_style" || input.action === "configure_documents_later") {
    await persistBranding(ctx, { status: input.action === "configure_documents_later" ? "skipped_for_now" : "default" });
    if(collection.branding?.afterSuccess)return{state,draft,documentId,reply:"Tudo bem. Quando quiser, posso configurar a identidade dos próximos documentos.",provider,documents,metrics,collection:{...collection,branding:undefined}};
    const notice = input.action === "configure_documents_later" ? lumeMessages.brandingLater : lumeMessages.brandingDefault;
    const continuation = resumeDocument();
    return { state: "collecting" as const, draft, documentId, reply: `${notice}\n\n${continuation}`, provider, documents, metrics, collection };
  }
  if (input.action === "cancel_branding_setup") {
    const hasResume = Boolean(collection.branding?.resumeAction);
    await persistBranding(ctx, { status: "default" });
    const reply = hasResume ? resumeDocument() : lumeMessages.cancelled;
    return { state: hasResume ? "collecting" as const : state, draft, documentId, reply, provider, documents, metrics, collection };
  }
  if (input.action === "adjust_document_branding") {
    collection = { ...collection, branding: { ...collection.branding, state: "adjusting" } };
    return { state, draft, documentId, reply: `${lumeMessages.brandingCurrent}\n\n• Alterar modelo\n• Alterar cor\n• Trocar logotipo\n• Remover logotipo\n• Voltar à prévia\n• Cancelar configuração`, provider, documents, metrics, collection };
  }
  if (input.action === "approve_document_branding" && collection.branding?.templateId && collection.branding.primaryColor) {
    await persistBranding(ctx, { status: "configured", templateId: collection.branding.templateId, primaryColor: collection.branding.primaryColor, logoStoragePath: collection.branding.logoStoragePath });
    const approved = lumeMessages.brandingApproved.replace("{modelo}", templateNames[collection.branding.templateId].toLocaleLowerCase("pt-BR"));
    const continuation = collection.branding.resumeAction ? `\n\n${resumeDocument()}` : "";
    return { state: continuation ? "collecting" as const : state, draft, documentId, reply: `${approved}${continuation}`, provider, documents, metrics, collection };
  }
  if (input.action === "retry_pdf") {
    if (state !== "confirmed" || !documentId) throw new Error("PDF_RETRY_NOT_AVAILABLE");
    return { state, draft, documentId, reply: lumeMessages.retryPdf, provider, documents, metrics, collection };
  }
  if (input.action === "message" && collection.party?.awaitingCnpjDecision) {
    const party = collection.party;
    const normalized = input.text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
    if (/^(?:1|sim|quero|incluir)$/.test(normalized)) {
      collection = { ...collection, party: { ...party, awaitingCnpjDecision: false, awaitingCnpj: true } };
      return { state: "collecting" as const, draft, documentId, reply: `Qual é o CNPJ da ${party.name}?`, provider, documents, metrics, collection };
    }
    if (/^(?:2|nao|nao precisa|sem cnpj|dispensar)$/.test(normalized)) {
      collection = { ...collection, party: { ...party, awaitingCnpjDecision: false, taxIdOmitted: true } };
      const next = await reviewOrPartyQuestion();
      return { ...next, draft, documentId, provider, documents, metrics, collection };
    }
    return { state: "collecting" as const, draft, documentId, reply: `Deseja incluir o CNPJ da ${party.name}?`, provider, documents, metrics, collection };
  }
  if (input.action === "message" && collection.party?.awaitingCnpj) {
    const party = collection.party;
    try {
      const taxId = extractCnpj(input.text);
      if (!taxId) throw new Error("INVALID_CNPJ");
      collection = { ...collection, party: { ...party, awaitingCnpj: false, taxId } };
      const next = await reviewOrPartyQuestion();
      return { ...next, draft, documentId, provider, documents, metrics, collection };
    } catch {
      return { state: "collecting" as const, draft, documentId, reply: `O CNPJ informado não é válido.\n\nEnvie novamente o CNPJ da ${party.name}. Os demais dados foram preservados.`, provider, documents, metrics, collection };
    }
  }
  if (input.action === "create_quote" || input.action === "create_purchase_order" || input.action === "search_document") {
    // O primeiro documento usa o modelo padrão. Personalização é oferecida somente após a entrega de valor.
    draft = agentDraftSchema.parse({ ...draft, type: input.action === "create_quote" ? "quote" : input.action === "create_purchase_order" ? "purchase_order" : "document_search" });
    state = "collecting";
    collection = { ...collection, summary: undefined, pendingField: undefined };
    reply = input.action === "create_quote" ? lumeMessages.customer : input.action === "create_purchase_order" ? lumeMessages.supplier : lumeMessages.search;
  }
  else if (input.action === "retry_contact") {
    draft = agentDraftSchema.parse({ ...draft, counterpartyName: null });
    state = "collecting";
    collection = { ...collection, summary: undefined, pendingField: draft.type === "purchase_order" ? "fornecedor" : "cliente" };
    reply = draft.type === "purchase_order" ? lumeMessages.supplier : lumeMessages.customer;
  }
  else if (input.action === "cancel") {
    state = "cancelled";
    collection = { ...collection, pendingField: undefined, correctionRequested: false, branding: undefined };
    reply = lumeMessages.cancelled;
  }
  else if (input.action === "correct") {
    state = "collecting";
    collection = { ...collection, summary: undefined, correctionRequested: true, pendingField: "correção" };
    reply = lumeMessages.correction;
  }
  else if (input.action === "confirm") {
    collection = { ...collection, confirmationAttempts: (collection.confirmationAttempts ?? 0) + 1 };
    if (state === "confirmed" && documentId)
      return { state, draft, documentId, reply: lumeMessages.alreadyConfirmed, provider, documents, metrics, collection };
    if (state !== "awaiting_confirmation") throw new Error("INVALID_CONFIRM_STATE");
    const legacyItem = collection.summary?.version !== AGENT_SUMMARY_VERSION && draft.type === "purchase_order" && draft.items.length === 1 && draft.items[0].quantity > 1 && !draft.amountScope ? draft.items[0] : undefined;
    if (legacyItem) {
      draft = agentDraftSchema.parse({ ...draft, items: [], quotedAmount: legacyItem.unitPrice, quotedQuantity: legacyItem.quantity, quotedItemDescription: legacyItem.description.replace(/^\d+\s+/u, ""), amountScope: "amount_scope_pending", totalPrice: null });
      const entities = {
        quantity: { value: legacyItem.quantity, raw: String(legacyItem.quantity), source: "user_message" as const, confidence: 1, normalized: String(legacyItem.quantity), requiresConfirmation: false },
        service: { value: draft.quotedItemDescription!, raw: draft.quotedItemDescription!, source: "user_message" as const, confidence: 1, normalized: draft.quotedItemDescription!, requiresConfirmation: false },
        price: { value: legacyItem.unitPrice, raw: String(legacyItem.unitPrice), source: "user_message" as const, confidence: 1, normalized: String(legacyItem.unitPrice), requiresConfirmation: true },
      };
      collection = { ...collection, summary: undefined, commercialInterpretation: { entities, pendingValueScope: true } };
      const labels = amountScopeLabels(draft.quotedItemDescription, draft.quotedQuantity);
      return { state: "collecting" as const, draft, documentId, reply: `Antes de criar o pedido, preciso confirmar o escopo do preço preservado.\n\nOs ${understoodValue(legacyItem.unitPrice)} correspondem a:\n\n1 — Valor de cada ${labels.unit}\n2 — Valor total ${labels.total}`, provider, documents, metrics, collection };
    }
    if (!reviewMatchesDraft(collection.summary, draft, collection.party?.taxId ?? null)) {
      const previousSummary = collection.summary;
      const differences = previousSummary ? differingAgentDraftFields(previousSummary.draft, draft) : [];
      const summary = buildAgentReviewSummary(draft, { validityFriendlyText: collection.validity?.friendlyText, partyTaxId: collection.party?.taxId ?? null });
      collection = { ...collection, summary, correctionRequested: false, pendingField: undefined };
      const explanation = differences.length ? changedFields(differences) : previousSummary ? lumeMessages.integrityChanged : lumeMessages.summaryMissing;
      return { state: "awaiting_confirmation" as const, draft, documentId, reply: `${explanation}\n\n${summary.text}`, provider, documents, metrics, collection };
    }
    if (!collection.party) {
      const partyResult = await prepareParty(ctx, draft, collection);
      collection = partyResult.collection;
      if (!partyResult.ready)
        return { state: "collecting" as const, draft, documentId, reply: partyResult.reply ?? lumeMessages.ambiguousContact, provider, documents, metrics, collection };
    }
    draft = agentDraftSchema.parse(collection.summary!.draft);
    const requestId = confirmationRequestId(ctx.organizationId, collection.summary!.fingerprint, collection.summary!.presentedAt);
    if (!collection.party || collection.party.awaitingCnpj || collection.party.awaitingCnpjDecision) throw new Error("PARTY_NOT_READY");
    const confirmedDocumentId = documentId ?? (await createAgentDraft(ctx, draft, requestId, { source: collection.party.source, name: collection.party.name, contactId: collection.party.contactId, taxId: collection.party.taxId })).id;
    documentId = confirmedDocumentId;
    const result = await confirmAgentDocument(ctx, confirmedDocumentId, true); state = "confirmed";
    reply = documentCreated(result.number, draft.type === "purchase_order" ? "purchase_order" : "quote", calculateDocument(draft.items, draft.shipping ?? 0).total);
  } else {
    if (input.action === "message" && collection.branding?.state === "awaiting_color") {
      try {
        const primaryColor = normalizeBrandColor(input.text);
        collection = { ...collection, branding: { ...collection.branding, state: "awaiting_approval", primaryColor } };
        return { state, draft, documentId, reply: lumeMessages.brandingPreview, provider, documents, metrics, collection };
      } catch {
        return { state, draft, documentId, reply: lumeMessages.brandingColor, provider, documents, metrics, collection };
      }
    }
    if (input.action === "message" && (draft.type === "quote" || draft.type === "purchase_order" || /\b(?:orçamento|orcamento|pedido de compra)\b/i.test(input.text))) {
      const stored = collection.commercialInterpretation;
      const expectedAnswer = expectedAnswerFor(draft, collection.pendingField ?? locateMissingFields(draft)[0]);
      collection = { ...collection, expectedAnswer };
      const provenanceAt = new Date().toISOString();
      const advanceAfterScopedUpdate = async (scopedProvider: string) => {
        const missing = locateMissingFields(draft);
        state = missing.length ? "collecting" : "awaiting_confirmation";
        if (missing.length) {
          collection = { ...collection, pendingField: missing[0], expectedAnswer: expectedAnswerFor(draft, missing[0]) };
          reply = questionFor(missing[0], draft);
        } else {
          const next = await reviewOrPartyQuestion(); state = next.state; reply = next.reply;
        }
        return { state, draft, documentId, reply, provider: scopedProvider, documents, metrics, collection };
      };
      const roleConflict = counterpartyRoleConflict(input.text);
      if (roleConflict) {
        collection = { ...collection, pendingField: "tipo de documento", expectedAnswer: "document_type" };
        const suffix = roleConflict.name ? ` para “${roleConflict.name}”` : "";
        return { state: "collecting" as const, draft, documentId, reply: `Entendi que você mencionou um orçamento e um fornecedor${suffix}. Você quer criar um orçamento para um cliente ou um pedido de compra para esse fornecedor?`, provider: "context-role-clarification", documents, metrics, collection };
      }
      if (expectedAnswer === "counterparty") {
        const counterparty = parseCounterpartyAnswer(input.text);
        if (counterparty) {
          draft = agentDraftSchema.parse({ ...draft, counterpartyName: counterparty });
          const source = { source: "user_current_message" as const, confidence: "high" as const, at: provenanceAt };
          collection = { ...collection, party: undefined, summary: undefined, pendingField: undefined, expectedAnswer: undefined, provenance: { ...collection.provenance, counterparty: source } };
          return advanceAfterScopedUpdate("context-counterparty");
        }
      }
      if (expectedAnswer === "correction" || collection.correctionRequested) {
        const correction = parseExplicitCorrection(input.text);
        if (!correction) return { state: "collecting" as const, draft, documentId, reply: "Não consegui identificar com segurança qual informação deve mudar. Diga o campo e o novo valor, por exemplo: ‘troca o pagamento para PIX’.", provider: "context-correction-clarification", documents, metrics, collection };
        const source = { source: "user_current_message" as const, confidence: "high" as const, at: provenanceAt };
        if (correction.target === "item" && draft.items.length === 1) {
          const current = draft.items[0]; const item = { ...current, description: correction.description };
          draft = agentDraftSchema.parse({ ...draft, items: [item], quotedItemDescription: item.description, totalPrice: item.quantity * item.unitPrice, itemType: parseItemBundle(`${item.description}, ${item.quantity} unidades, ${item.unitPrice} reais cada`)?.itemType ?? "unknown" });
          collection = { ...collection, summary: undefined, correctionRequested: false, pendingField: undefined, provenance: { ...collection.provenance, item: source, totalPrice: { source: "derived_calculation", confidence: "high", at: provenanceAt } } };
        } else if (correction.target === "quantity" && draft.items.length === 1) {
          const current = draft.items[0]; const item = { ...current, quantity: correction.quantity, ...(correction.description && !/^(?:unidades?|itens?)$/i.test(correction.description) ? { description: correction.description } : {}) };
          draft = agentDraftSchema.parse({ ...draft, items: [item], quotedQuantity: item.quantity, quotedItemDescription: item.description, totalPrice: item.quantity * item.unitPrice });
          collection = { ...collection, summary: undefined, correctionRequested: false, pendingField: undefined, provenance: { ...collection.provenance, quantity: source, totalPrice: { source: "derived_calculation", confidence: "high", at: provenanceAt } } };
        } else if (correction.target === "payment") {
          draft = agentDraftSchema.parse({ ...draft, paymentTerms: correction.payment.display, paymentDetails: correction.payment });
          collection = { ...collection, summary: undefined, correctionRequested: false, pendingField: undefined, provenance: { ...collection.provenance, paymentTerms: source } };
        } else if (correction.target === "deadline") {
          draft = agentDraftSchema.parse({ ...draft, deadline: correction.deadline });
          collection = { ...collection, summary: undefined, correctionRequested: false, pendingField: undefined, provenance: { ...collection.provenance, deadline: source } };
        } else if (correction.target === "counterparty") {
          draft = agentDraftSchema.parse({ ...draft, counterpartyName: correction.name });
          collection = { ...collection, party: undefined, summary: undefined, correctionRequested: false, pendingField: undefined, provenance: { ...collection.provenance, counterparty: source } };
        } else return { state: "collecting" as const, draft, documentId, reply: "Essa correção precisa indicar um item existente e o novo valor.", provider: "context-correction-clarification", documents, metrics, collection };
        const next = await reviewOrPartyQuestion("Correção aplicada. Os demais dados foram preservados.");
        return { ...next, draft, documentId, provider: "context-explicit-correction", documents, metrics, collection };
      }
      const quantityCorrection = draft.items.length === 1 ? explicitQuantityCorrection(input.text) : undefined;
      if (quantityCorrection) {
        const current = draft.items[0];
        const item = { ...current, quantity: quantityCorrection.quantity, description: quantityCorrection.description && !/^(?:unidades?|itens?)$/i.test(quantityCorrection.description) ? quantityCorrection.description : current.description };
        draft = agentDraftSchema.parse({ ...draft, items: [item], quotedQuantity: item.quantity, quotedItemDescription: item.description, totalPrice: item.quantity * item.unitPrice });
        collection = { ...collection, summary: undefined, provenance: { ...collection.provenance, quantity: { source: "user_current_message", confidence: "high", at: provenanceAt } } };
        return advanceAfterScopedUpdate("context-explicit-correction");
      }
      if (!stored && expectedAnswer === "item_bundle") {
        const bundle = parseItemBundle(input.text);
        if (bundle) {
          draft = agentDraftSchema.parse({ ...draft, items: [{ description: bundle.description, quantity: bundle.quantity, unit: "un", unitPrice: bundle.unitPrice, discount: 0 }], quotedItemDescription: bundle.description, quotedQuantity: bundle.quantity, quotedAmount: bundle.unitPrice, amountScope: "unit", totalPrice: bundle.total, itemType: bundle.itemType });
          const source = { source: "user_current_message" as const, confidence: "high" as const, at: provenanceAt };
          collection = { ...collection, summary: undefined, provenance: { ...collection.provenance, item: source, quantity: source, unitPrice: source, totalPrice: { source: "derived_calculation", confidence: "high", at: provenanceAt } } };
          return advanceAfterScopedUpdate("context-item-bundle");
        }
        return { state: "collecting" as const, draft, documentId, reply: "Não consegui separar com segurança o item, a quantidade e o valor unitário. Pode informar, por exemplo: ‘lâmpadas, 20 unidades, 30 reais cada’?", provider: "context-item-clarification", documents, metrics, collection };
      }
      if (!stored && expectedAnswer === "delivery_deadline") {
        const deadline = parseDeadlineAnswer(input.text);
        if (deadline) {
          const additionalPayment = paymentOnlyUpdate(input.text);
          draft = agentDraftSchema.parse({ ...draft, deadline, ...(additionalPayment ? { paymentTerms: additionalPayment.display, paymentDetails: additionalPayment } : {}) });
          const source = { source: "user_current_message" as const, confidence: "high" as const, at: provenanceAt };
          collection = { ...collection, summary: undefined, provenance: { ...collection.provenance, deadline: source, ...(additionalPayment ? { paymentTerms: source } : {}) } };
          return advanceAfterScopedUpdate("context-deadline");
        }
        return { state: "collecting" as const, draft, documentId, reply: questionFor("prazo", draft), provider: "context-deadline-clarification", documents, metrics, collection };
      }
      if (!stored && expectedAnswer === "payment_terms") {
        const paymentDetails = paymentOnlyUpdate(input.text);
        if (paymentDetails) {
          draft = agentDraftSchema.parse({ ...draft, paymentTerms: paymentDetails.display, paymentDetails });
          collection = { ...collection, summary: undefined, provenance: { ...collection.provenance, paymentTerms: { source: "user_current_message", confidence: "high", at: provenanceAt } } };
          return advanceAfterScopedUpdate("context-payment");
        }
        return { state: "collecting" as const, draft, documentId, reply: "Qual é a forma e a condição de pagamento? Por exemplo: PIX à vista ou cartão de crédito em 2 vezes.", provider: "context-payment-clarification", documents, metrics, collection };
      }
      if (stored?.pendingValueScope || draft.amountScope === "amount_scope_pending") {
        const normalized = input.text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
        const scope = /^(?:1|valor de cada unidade|valor unitario|unitario|cada|cada camera|cada cadeira)$/.test(normalized) ? "unit" : /^(?:2|valor total|total|e o total|corresponde ao total|valor total do pedido)$/.test(normalized) ? "total" : undefined;
        const labels=amountScopeLabels(draft.quotedItemDescription,draft.quotedQuantity);
        if (!scope) return { state: "collecting" as const, draft, documentId, reply: `Os ${understoodValue(Number(draft.quotedAmount??0))} correspondem a:\n\n1 — Valor de cada ${labels.unit}\n2 — Valor total ${labels.total}`, provider, documents, metrics, collection };
        const entities = { ...(stored?.entities??{}), quantity:{value:draft.quotedQuantity!,raw:String(draft.quotedQuantity),source:"user_message" as const,confidence:1,normalized:String(draft.quotedQuantity),requiresConfirmation:false},service:{value:draft.quotedItemDescription!,raw:draft.quotedItemDescription!,source:"user_message" as const,confidence:1,normalized:draft.quotedItemDescription!,requiresConfirmation:false},price:{value:draft.quotedAmount!,raw:String(draft.quotedAmount),source:"user_message" as const,confidence:1,normalized:String(draft.quotedAmount),requiresConfirmation:false}, value_scope: { value: scope, raw: input.text, source: "user_message" as const, confidence: 1, normalized: scope, requiresConfirmation: false } };
        const type = draft.type === "purchase_order" ? "purchase_order" : "quote";
        draft = agentDraftSchema.parse(applyEntitiesToAgentDraft(draft, entities, type));
        collection = { ...collection, commercialInterpretation: undefined, summary: undefined, hybrid: { ...collection.hybrid, recentEntities: entities } };
        const missing = locateMissingFields(draft);
        state = missing.length ? "collecting" : "awaiting_confirmation";
        if (missing.length) reply = `Certo. O valor foi registrado como ${scope === "total" ? "total do pedido" : "unitário"}.\n\n${questionFor(missing[0], draft)}`;
        else { const next = await reviewOrPartyQuestion(); state = next.state; reply = next.reply; }
        return { state, draft, documentId, reply, provider, documents, metrics, collection };
      }
      const entities = extractEntities(input.text, { today: input.today }) as Record<string, CommercialEntity>;
      const understoodCount = ["customer", "service", "quantity", "price", "payment_terms", "validity"].filter((key) => entities[key]).length;
      if (understoodCount >= 3 && Boolean(entities.customer || entities.price || entities.payment_terms)) {
        const type = draft.type === "purchase_order" || /pedido de compra/i.test(input.text) ? "purchase_order" : "quote";
        draft = agentDraftSchema.parse(applyEntitiesToAgentDraft(draft, entities, type));
        const valueAmbiguous = entities.value_scope?.value === "amount_scope_pending" || Boolean(entities.service && entities.quantity && entities.price && !entities.value_scope);
        collection = { ...collection, commercialInterpretation: { entities, pendingValueScope: valueAmbiguous || undefined }, hybrid: { ...collection.hybrid, lastIntent: type === "quote" ? "create_quote" : "create_purchase_order", recentEntities: entities } };
        const understood = understoodCommercialData(entities, type, draft.itemType);
        if (valueAmbiguous) { const labels=amountScopeLabels(String(entities.service.value),Number(entities.quantity.value)); return { state: "collecting" as const, draft, documentId, reply: `${understood}\n\nOs ${understoodValue(Number(entities.price.value))} correspondem a:\n\n1 — Valor de cada ${labels.unit}\n2 — Valor total ${labels.total}`, provider: "commercial-entities", documents, metrics, collection }; }
        collection = { ...collection, commercialInterpretation: undefined };
        const missing = locateMissingFields(draft);
        state = missing.length ? "collecting" : "awaiting_confirmation";
        if (missing.length) reply = `${understood}\n\nAinda preciso desta informação:\n\n${questionFor(missing[0], draft)}`;
        else { const next = await reviewOrPartyQuestion(understood, entities.validity?.raw); state = next.state; reply = next.reply; }
        return { state, draft, documentId, reply, provider: "commercial-entities", documents, metrics, collection };
      }
    }
    const pending = locateMissingFields(draft)[0];
    if (input.action === "message" && pending === "prazo") {
      const deadline = /\b(?:em\s+)?(\d{1,4})\s+dias?(?:\s+uteis)?\b/i.exec(input.text);
      if (deadline && Number(deadline[1]) > 0) {
        draft = agentDraftSchema.parse({ ...draft, deadline: `${Number(deadline[1])} dias${/uteis/i.test(input.text) ? " úteis" : ""}` });
        const missing = locateMissingFields(draft);
        state = missing.length ? "collecting" : "awaiting_confirmation";
        if (missing.length) reply = questionFor(missing[0], draft);
        else { const next = await reviewOrPartyQuestion(); state = next.state; reply = next.reply; }
        return { state, draft, documentId, reply, provider: "commercial-deadline", documents, metrics, collection };
      }
    }
    if (input.action === "message" && pending === "condição de pagamento") {
      const paymentTerms = parsePaymentTerms(input.text);
      if (paymentTerms) {
        draft = agentDraftSchema.parse({ ...draft, paymentTerms });
        const missing = locateMissingFields(draft);
        state = missing.length ? "collecting" : "awaiting_confirmation";
        if (missing.length) reply = questionFor(missing[0], draft);
        else { const next = await reviewOrPartyQuestion(); state = next.state; reply = next.reply; }
        return { state, draft, documentId, reply, provider: "commercial-payment", documents, metrics, collection };
      }
    }
    if (input.action === "message" && pending === "endereço de entrega") {
      const deliveryAddress = deliveryAddressWithoutPhone(input.text);
      if (deliveryAddress.length >= 5) {
        draft = agentDraftSchema.parse({ ...draft, deliveryAddress });
        const missing = locateMissingFields(draft);
        if (missing.length) return { state: "collecting" as const, draft, documentId, reply: questionFor(missing[0], draft), provider: "commercial-address", documents, metrics, collection };
        const next = await reviewOrPartyQuestion();
        return { ...next, draft, documentId, provider: "commercial-address", documents, metrics, collection };
      }
    }
    if (draft.type === "quote" && pending === "validade") {
      const prior = collection.validity;
      if (asksForPreviousReason(input.text) && prior?.lastError) {
        reply = `${prior.lastError}\n\nOs demais dados do orçamento foram preservados.\n\nContinuamos na validade para concluir esta etapa.`;
        collection = { ...collection, pendingField: "validade" };
        return { state: "collecting" as const, draft, documentId, reply, provider, documents, metrics, collection };
      }
      const parsed = parseQuoteValidity(input.text, input.today);
      if (!parsed.success) {
        const attempts = (prior?.attempts ?? 0) + 1;
        reply = validityErrorReply(parsed.reason, attempts);
        collection = { ...collection, pendingField: "validade", validity: { attempts, lastError: parsed.reason } };
        return { state: "collecting" as const, draft, documentId, reply, provider, documents, metrics, collection };
      }
      draft = agentDraftSchema.parse({ ...draft, validity: parsed.canonical });
      collection = { ...collection, pendingField: undefined, validity: { attempts: 0, friendlyText: parsed.friendlyText } };
      const missing = locateMissingFields(draft);
      state = missing.length ? "collecting" : "awaiting_confirmation";
      if (missing.length) reply = questionFor(missing[0], draft);
      else {
        const next = await reviewOrPartyQuestion(undefined, parsed.friendlyText);
        state = next.state;
        reply = next.reply;
      }
      return { state, draft, documentId, reply, provider, documents, metrics, collection };
    }
    collection = { ...collection, summary: undefined };
    const ai = getAgentAIProvider(); provider = ai.name;
    const decision = await ai.analyze(input.text, draft); metrics = ai.getLastMetrics?.();
    draft = agentDraftSchema.parse({ ...decision.draft, paymentTerms: normalizePaymentTerms(decision.draft.paymentTerms), validity: normalizeValidity(decision.draft.validity, input.today) });
    if (decision.intent === "cancel") { state = "cancelled"; reply = lumeMessages.cancelled; }
    else if (draft.type === "document_search" && draft.documentQuery) {
      documents = await queryDocuments(ctx, draft.documentQuery); state = "collecting";
      reply = searchResults(documents);
    } else {
      const missing = [...decision.ambiguities, ...locateMissingFields(draft)];
      state = missing.length ? "collecting" : "awaiting_confirmation";
      if (missing.length) reply = questionFor(missing[0], draft);
      else {
        const next = await reviewOrPartyQuestion();
        state = next.state;
        reply = next.reply;
      }
    }
  }
  return { state, draft, documentId, reply, provider, documents, metrics, collection, pdfUrl: state === "confirmed" && documentId ? `/api/documents/${documentId}/pdf` : undefined };
}
