import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  emptyAgentDraft,
  agentDraftSchema,
  type AgentState,
} from "@/lib/ai/contracts";
import { getAgentAIProvider } from "@/lib/ai/openai-provider";
import {
  isLumeGreeting,
  runAgentTurn,
  shouldSendProcessingMessage,
} from "@/lib/ai/turn";
import {
  destination,
  navigationState,
  menus,
  renderMenu,
  resolveGlobalNavigation,
  resolveMenuInput,
  safePreviousMenu,
} from "@/lib/navigation/menu-engine";
import { handleWhatsAppMenuQuery } from "@/lib/whatsapp/menu-queries";
import { renderNavigableResponse } from "@/lib/navigation/continuity";
import { orchestrateHybrid, pauseForInterruption } from "@/lib/orchestrator/orchestrator";
import { presentDecision } from "@/lib/orchestrator/presentation";
import { applyEntitiesToAgentDraft } from "@/lib/orchestrator/entities";
import { hybridOrchestratorEnabled } from "@/lib/orchestrator/policy";
import { organizationToday, type AgentCollectionContext } from "@/lib/ai/validity";
import type { AgentToolContext } from "@/lib/ai/tools";
import {
  type NormalizedInbound,
  type NormalizedOutbound,
} from "@/lib/channels/contracts";
import { isAuthorizedWhatsAppRecipient } from "@/lib/channels/whatsapp-recipient";
import {
  MetaApiError,
  WhatsAppChannelAdapter,
  shouldAdvanceWhatsAppStatus,
  type ParsedWhatsAppEvent,
  type WhatsAppStatus,
} from "@/lib/channels/whatsapp-adapter";
import { withBackoff } from "@/lib/channels/queue";
import { generateStoredDocumentPdf } from "@/lib/pdf/store-document";
import { generateBrandingPreviewPdf } from "@/lib/pdf/branding-preview";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  agentActionForInbound,
  buildAgentWhatsAppOutputs,
  buildWhatsAppError,
  whatsappConversationKey,
  withPdfDeliveryOutcome,
} from "./agent-bridge";
import { formatLumeMessage, lumeMessages } from "./lume-messages";
import { validateLogo } from "@/lib/branding/image";
import { activeBranding, persistBranding } from "@/lib/branding/store";
import { shouldOfferBranding } from "@/lib/branding/identity";
import { searchAdministrativeFiles, signedAdministrativeFileUrl, storeAdministrativeFile } from "@/lib/administrative-vault/files";
import { consumeConversationPrompt, createConversationPrompt, isPromptEligible, resolveActivePrompt } from "@/lib/navigation/conversation-prompts";
import { shouldStartNewSession } from "@/lib/navigation/session-policy";
import { deriveAdministrativeTask } from "@/lib/orchestrator/task-model";
import { mapLegacyContext } from "@/lib/agent-v1/legacy-mapper";
import { compareAgentDecisions, runLumeAgentV1 } from "@/lib/agent-v1/engine";
import { processAgentV1Turn } from "@/lib/agent-v1/processor";
import { createAgentV1RealTools } from "@/lib/agent-v1/real-tools";
import { applyConversationExperience } from "@/lib/conversation/experience";
import { classifyIntentTransition, cleanDraftForIntent, switchLabels, type PendingIntentSwitch } from "@/lib/conversation/intent-transition";
import { runConversationV2Shadow } from "@/lib/conversation-v2/shadow";
import { persistConversationV2ShadowTurn } from "@/lib/conversation-v2/persistent-shadow";

const promptActionIds = new Set(["show_main","show_commercial","show_operations","show_finance","show_content","show_management","talk_to_lume","create_quote","create_purchase_order","search_document","confirm","correct","cancel","emit_default_document","customize_documents_now","use_default_document_style","configure_documents_later","continue_without_logo","cancel_branding_setup","template_essential","template_executive","template_contemporary","template_commercial","approve_document_branding","adjust_document_branding"]);
const navigationActionIds = new Set(["show_main","show_commercial","show_operations","show_finance","show_content","show_management","talk_to_lume","create_quote","create_purchase_order","search_document","search_operations","query_confirmed_values","search_purchase_orders","query_documents_attention","query_customers","query_suppliers","query_catalog","query_documents","query_management_summary","choose_operations_period","search_operations_7d","search_operations_30d","search_operations_month","back","cancel"]);
function promptForResult(result:{state:AgentState;reply:string;collection:AgentCollectionContext}){
  if(result.collection.pendingIntentSwitch){const labels=switchLabels(result.collection.pendingIntentSwitch);return createConversationPrompt({promptType:"confirmation",flowId:`intent_switch:${result.collection.pendingIntentSwitch.from}:${result.collection.pendingIntentSwitch.to}`,expectedState:result.state,options:[{number:1,id:"start_intent_switch",label:`Começar ${labels.task}`},{number:2,id:"continue_current_task",label:`Continuar ${labels.current}`},{number:3,id:"cancel_intent_switch",label:"Cancelar"}]});}
  if(result.collection.vaultSearch?.results.length)return createConversationPrompt({promptType:"continuation",flowId:"administrative_file_search",expectedState:"menu",options:result.collection.vaultSearch.results.map((item,index)=>({number:index+1,id:`vault_file:${item.id}`,label:item.label}))});
  if(result.collection.party?.awaitingCnpjDecision)return createConversationPrompt({promptType:"continuation",flowId:"party_cnpj",expectedState:"collecting",options:[{number:1,id:"include_cnpj",label:"Sim"},{number:2,id:"skip_cnpj",label:"Não precisa"}]});
  if(result.reply===lumeMessages.opening)return undefined;
  if(result.reply===lumeMessages.uncertainIntent)return createConversationPrompt({promptType:"continuation",flowId:"uncertain_intent",expectedState:result.state,options:[{number:1,id:"show_main",label:"Menu de soluções"}]});
  if(result.collection.branding?.state==="offer"&&result.collection.branding.preEmission)return createConversationPrompt({promptType:"branding_offer",flowId:"pre_emission_branding",expectedState:"awaiting_confirmation",options:[{number:1,id:"emit_default_document",label:"Emitir modelo padrão"},{number:2,id:"customize_documents_now",label:"Personalizar agora"}]});
  if(result.collection.branding?.state==="awaiting_logo")return createConversationPrompt({promptType:"branding_logo",flowId:result.collection.branding.preEmission?"pre_emission_branding":result.collection.branding.afterSuccess?"branding_after_success":result.collection.branding.resumeAction??"branding",expectedState:result.state,options:result.collection.branding.preEmission?[{number:1,id:"emit_default_document",label:"Emitir sem logo"}]:[{number:1,id:"continue_without_logo",label:"Continuar sem logo"},{number:2,id:"cancel_branding_setup",label:"Cancelar configuração"}]});
  if(result.state==="awaiting_confirmation")return createConversationPrompt({promptType:"confirmation",flowId:"commercial_document",expectedState:"awaiting_confirmation",options:[{number:1,id:"confirm_document",label:"Confirmar"},{number:2,id:"correct_document",label:"Corrigir"},{number:3,id:"cancel_document",label:"Cancelar"}]});
  if(result.reply===lumeMessages.brandingOffer)return createConversationPrompt({promptType:"branding_offer",flowId:result.collection.branding?.resumeAction??"branding",expectedState:result.state,options:[{number:1,id:"customize_documents_now",label:"Personalizar agora"},{number:2,id:"use_default_document_style",label:"Usar modelo padrão"},{number:3,id:"configure_documents_later",label:"Configurar depois"}]});
  if(result.collection.branding?.state==="awaiting_template")return createConversationPrompt({promptType:"branding_template",flowId:result.collection.branding.resumeAction??"branding",expectedState:result.state,options:[{number:1,id:"template_essential",label:"Essencial"},{number:2,id:"template_executive",label:"Executivo"},{number:3,id:"template_contemporary",label:"Contemporâneo"},{number:4,id:"template_commercial",label:"Comercial"}]});
  if(result.reply===lumeMessages.brandingPreview)return createConversationPrompt({promptType:"branding_approval",flowId:result.collection.branding?.resumeAction??"branding",expectedState:result.state,options:[{number:1,id:"approve_document_branding",label:"Aprovar"},{number:2,id:"adjust_document_branding",label:"Ajustar"},{number:3,id:"use_default_document_style",label:"Usar modelo padrão"}]});
  if(result.collection.commercialInterpretation?.pendingValueScope)return createConversationPrompt({promptType:"continuation",flowId:"commercial_value_scope",expectedState:"collecting",options:[{number:1,id:"price_unit",label:"Valor de cada unidade"},{number:2,id:"price_total",label:"Valor total"}]});
  const actions=result.collection.navigation?.continuation_actions;
  if(actions?.length)return createConversationPrompt({promptType:"continuation",flowId:result.collection.navigation?.current_menu??"navigation",expectedState:result.state,menuId:result.collection.navigation?.current_menu,options:actions.map((option,index)=>({number:index+1,id:option.action,label:option.label}))});
  const menuId=result.collection.navigation?.current_menu;
  if(result.state==="menu"&&menuId&&result.reply===renderMenu(menuId)){const options=menus[menuId].items.filter(option=>option.available).map((option,index)=>({number:index+1,id:option.action,label:option.label}));return createConversationPrompt({promptType:"menu",flowId:menuId,expectedState:"menu",menuId,options});}
  return undefined;
}

async function deliverWithRetry(
  adapter: WhatsAppChannelAdapter,
  output: NormalizedOutbound,
) {
  return withBackoff(() => adapter.deliver(output), {
    attempts: 3,
    baseDelayMs: 500,
    shouldRetry: (error) =>
      error instanceof Error &&
      "retryable" in error &&
      Boolean((error as { retryable?: boolean }).retryable),
  });
}

async function claim(admin: SupabaseClient, message: NormalizedInbound) {
  const { error } = await admin
    .from("channel_message_jobs")
    .insert({
      organization_id: message.organizationId,
      channel: message.channel,
      external_message_id: message.externalMessageId,
      external_conversation_id: message.externalConversationId,
      kind: message.kind,
      normalized_payload: message,
      processing_status: "received",
      received_at: message.receivedAt,
    });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error("CHANNEL_JOB_CLAIM_FAILED");
}

async function updateJob(
  admin: SupabaseClient,
  message: NormalizedInbound,
  status: "processing" | "responded" | "failed",
  errorCode?: string,
) {
  await admin
    .from("channel_message_jobs")
    .update({
      processing_status: status,
      error_code: errorCode ?? null,
      processed_at: status === "processing" ? null : new Date().toISOString(),
    })
    .eq("channel", message.channel)
    .eq("external_message_id", message.externalMessageId)
    .eq("organization_id", message.organizationId);
}

export async function processWhatsAppEvent(event: ParsedWhatsAppEvent) {
  const admin = createSupabaseAdminClient();
  const { data: channel } = await admin
    .from("whatsapp_channels")
    .select("organization_id")
    .eq("phone_number_id", event.phoneNumberId)
    .eq("active", true)
    .maybeSingle();
  if (!channel) return { ignored: "CHANNEL_NOT_REGISTERED" as const };
  const { data: member } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", channel.organization_id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!member) return { ignored: "ORGANIZATION_WITHOUT_MEMBER" as const };
  const adapter = new WhatsAppChannelAdapter({
    phoneNumberId: event.phoneNumberId,
  });
  const message = adapter.normalize({
    event,
    organizationId: channel.organization_id,
    actorId: member.user_id,
  });
  if (!(await claim(admin, message))) return { duplicate: true as const };
  if (message.kind === "status") {
    const target = String(message.metadata.targetMessageId ?? "");
    const next = message.metadata.status as WhatsAppStatus | undefined;
    if (target && next) {
      const { data: prior } = await admin
        .from("messages")
        .select("delivery_status")
        .eq("organization_id", message.organizationId)
        .eq("whatsapp_message_id", target)
        .maybeSingle();
      if (
        prior &&
        shouldAdvanceWhatsAppStatus(
          prior.delivery_status as WhatsAppStatus | null,
          next,
        )
      )
        await admin
          .from("messages")
          .update({
            delivery_status: next,
            delivery_status_updated_at: message.receivedAt,
          })
          .eq("organization_id", message.organizationId)
          .eq("whatsapp_message_id", target);
    }
    await updateJob(admin, message, "responded");
    return { status: true as const };
  }
  if (
    !isAuthorizedWhatsAppRecipient(
      message.externalConversationId,
      process.env.WHATSAPP_TEST_RECIPIENT,
    )
  ) {
    await updateJob(admin, message, "failed", "WHATSAPP_RECIPIENT_NOT_ALLOWED");
    console.warn("whatsapp.inbound.rejected", {
      organizationId: message.organizationId,
      kind: message.kind,
      code: "RECIPIENT_NOT_ALLOWED",
    });
    return { ignored: "RECIPIENT_NOT_ALLOWED" as const };
  }
  const lockKey = `${message.organizationId}:${message.externalConversationId}`;
  const { data: locked } = await admin.rpc("acquire_channel_lock", {
    p_lock_key: lockKey,
    p_organization_id: message.organizationId,
    p_lease_seconds: 60,
  });
  if (!locked) return { deferred: true as const };
  let deliveredCount = 0;
  let processingMessageSent = false;
  let conversationState: AgentState | undefined;
  try {
    await updateJob(admin, message, "processing");
    const contactKey = whatsappConversationKey(
      event.phoneNumberId,
      message.externalConversationId!,
    );
    let { data: conversation } = await admin
      .from("conversations")
      .select("id,state,context,updated_at")
      .eq("organization_id", message.organizationId)
      .eq("whatsapp_contact_id", contactKey)
      .maybeSingle();
    if (!conversation) {
      const created = await admin
        .from("conversations")
        .insert({
          organization_id: message.organizationId,
          user_id: member.user_id,
          whatsapp_contact_id: contactKey,
          state: "menu",
          context: { draft: emptyAgentDraft() },
        })
        .select("id,state,context,updated_at")
        .single();
      if (created.error || !created.data)
        throw new Error("CONVERSATION_NOT_CREATED");
      conversation = created.data;
    }
    const inboundRecord = await admin.from("messages").insert({
      organization_id: message.organizationId,
      conversation_id: conversation.id,
      whatsapp_message_id: message.externalMessageId,
      direction: "inbound",
      kind: message.kind === "button" ? "interactive" : message.kind,
      content: {
        action: agentActionForInbound(message),
        hasText: Boolean(message.text),
        hasMedia: Boolean(message.mediaReference),
      },
      processing_status: "processing",
    }).select("id").single();
    if (inboundRecord.error && inboundRecord.error.code !== "23505")
      throw new Error("INBOUND_MESSAGE_PERSIST_FAILED");
    let text = message.text ?? "";
    let transcriptionMetrics: unknown;
    let brandingLogoPath: string | undefined;
    let vaultReceipt: string | undefined;
    if (message.kind === "audio") {
      const file = await adapter.downloadAudio(message.mediaReference ?? "");
      const ai = getAgentAIProvider();
      text = await ai.transcribe(file);
      transcriptionMetrics = ai.getLastMetrics?.();
    }
    const context = conversation.context as Record<string, unknown>;
    const draft = agentDraftSchema
      .catch(emptyAgentDraft())
      .parse(context.draft);
    const state = new Set(["menu","collecting","awaiting_confirmation","confirmed","cancelled","error"]).has(conversation.state) ? conversation.state as AgentState : "menu";
    conversationState = state;
    let existingCollection = (context.collection ?? {}) as AgentCollectionContext;
    if(!isPromptEligible(existingCollection.activePrompt,state))existingCollection={...existingCollection,activePrompt:undefined};
    if(existingCollection.branding&&!existingCollection.activePrompt?.promptType.startsWith("branding_"))existingCollection={...existingCollection,branding:undefined};
    if(state==="menu"&&existingCollection.activePrompt?.promptType==="menu")existingCollection={...existingCollection,pendingField:undefined,correctionRequested:false,commercialInterpretation:undefined};
    let action: Parameters<typeof runAgentTurn>[1]["action"] = agentActionForInbound(message);
    const v1BrandingAwaitingLogo=process.env.LUME_AGENT_V1_ENABLED==="true"&&(existingCollection.taskStateV1 as {type?:string;currentQuestion?:{type?:string}}|undefined)?.type==="branding_setup"&&(existingCollection.taskStateV1 as {currentQuestion?:{type?:string}}).currentQuestion?.type==="brand_logo";
    if (message.kind === "image" && (existingCollection.branding?.state === "awaiting_logo"||v1BrandingAwaitingLogo)) {
      const file = await adapter.downloadBrandingLogo(
        message.mediaReference ?? "",
      );
      const validated = await validateLogo(file);
      brandingLogoPath = `${message.organizationId}/document-branding/${crypto.randomUUID()}.${validated.extension}`;
      const stored = await admin.storage
        .from("organization-assets")
        .upload(brandingLogoPath, validated.bytes, {
          contentType: validated.mimeType,
          upsert: false,
        });
      if (stored.error) throw new Error("BRANDING_LOGO_STORAGE_FAILED");
      text = "Logo recebida";
      action = existingCollection.branding?.preEmission ? "confirm" : "continue_without_logo";
    } else if ((message.kind === "document" || message.kind === "image") && message.mediaReference) {
      const filename = typeof message.metadata.filename === "string" ? message.metadata.filename : message.kind === "image" ? "imagem-whatsapp" : "documento-whatsapp";
      const file = await adapter.downloadAdministrativeMedia(message.mediaReference, filename);
      const stored = await storeAdministrativeFile(admin, { organizationId: message.organizationId, conversationId: conversation.id, inboundMessageId: inboundRecord.data?.id, userId: member.user_id, providerMediaId: message.mediaReference, filename: file.name, mimeType: file.type, caption: message.text, bytes: new Uint8Array(await file.arrayBuffer()), occurredAt: message.receivedAt });
      vaultReceipt = stored.duplicate ? `Este arquivo já estava guardado com segurança como “${stored.document_category}”.` : stored.document_category === "outro" ? "Arquivo recebido e guardado com segurança.\n\nVou organizá-lo para facilitar futuras buscas." : `Arquivo recebido e guardado como “${stored.document_category}”.`;
      text = message.text || "arquivo recebido";
    }
    if (!text.trim())
      throw new Error(
        message.kind === "audio"
          ? "WHATSAPP_AUDIO_EMPTY"
          : "WHATSAPP_MESSAGE_WITHOUT_TEXT",
      );
    const ctx: AgentToolContext = {
      organizationId: message.organizationId,
      supabase: admin as AgentToolContext["supabase"],
      userId: member.user_id,
    };
    let collection = brandingLogoPath
      ? {
          ...existingCollection,
          branding: {
            ...existingCollection.branding!,
            logoStoragePath: brandingLogoPath,
          },
        }
      : existingCollection;
    if(brandingLogoPath&&existingCollection.branding?.preEmission){
      await persistBranding(ctx,{status:"configured",logoStoragePath:brandingLogoPath});
      collection={...collection,branding:undefined};
    }
    if(brandingLogoPath&&existingCollection.branding?.afterSuccess){
      await persistBranding(ctx,{status:"configured",logoStoragePath:brandingLogoPath});
      const terminalCollection={...collection,branding:undefined,activePrompt:undefined,summary:undefined,pendingField:undefined,correctionRequested:false};
      const terminalResult={state:"confirmed" as const,draft,documentId:typeof context.documentId==="string"?context.documentId:undefined,reply:"Logo recebida e salva. Vou utilizá-la nos próximos documentos.",provider:"post-success-branding",documents:undefined,metrics:undefined,collection:terminalCollection};
      await admin.from("conversations").update({state:"confirmed",context:{draft,documentId:terminalResult.documentId,collection:terminalCollection},updated_at:new Date().toISOString()}).eq("id",conversation.id).eq("organization_id",message.organizationId);
      const outputs=buildAgentWhatsAppOutputs(message,terminalResult);
      for(const output of outputs)await deliverWithRetry(adapter,output);
      await updateJob(admin,message,"responded");
      return{processed:true as const};
    }
    const turnInput = {
      action,
      text,
      idempotencyKey: message.externalMessageId,
      state,
      draft,
      documentId:
        typeof context.documentId === "string" ? context.documentId : undefined,
      collection,
      today: organizationToday(new Date(message.receivedAt)),
    };
    const taskStateV1Enabled=process.env.LUME_TASK_STATE_V1_ENABLED==="true";
    const agentV1Enabled=process.env.LUME_AGENT_V1_ENABLED==="true";
    const mappedTask=taskStateV1Enabled||agentV1Enabled?mapLegacyContext({state,context:{draft,documentId:context.documentId,collection},now:new Date(message.receivedAt)}):undefined;
    if(agentV1Enabled&&mappedTask){
      const tools=createAgentV1RealTools({ctx,brandingLogoRef:brandingLogoPath,deliverDocument:async(file,requestId)=>{
        const existing=await admin.from("messages").select("whatsapp_message_id,processing_status").eq("organization_id",message.organizationId).eq("conversation_id",conversation.id).eq("content->>requestId",requestId).maybeSingle();
        if(existing.data?.processing_status==="processed"&&existing.data.whatsapp_message_id)return String(existing.data.whatsapp_message_id);
        const sent=await deliverWithRetry(adapter,{channel:"whatsapp",conversationId:message.externalConversationId!,kind:"document",text:"Documento emitido pela Lume",mediaReference:file.url,replyToExternalMessageId:message.externalMessageId,metadata:{filename:file.filename,state:"completed",requestId}});
        await admin.from("messages").upsert({organization_id:message.organizationId,conversation_id:conversation.id,whatsapp_message_id:sent.externalMessageId,direction:"outbound",kind:"document",content:{requestId,filename:file.filename},processing_status:"processed",delivery_status:"sent",delivery_status_updated_at:new Date().toISOString()},{onConflict:"organization_id,whatsapp_message_id"});
        return sent.externalMessageId;
      }});
      const v1=await processAgentV1Turn({message:text,buttonId:message.buttonId,task:mappedTask.task,today:turnInput.today,now:new Date(message.receivedAt),brandingLogoRef:brandingLogoPath,tools});
      if(v1.legacyAuthorityInvoked!==false)throw new Error("AGENT_V1_LEGACY_AUTHORITY_INVOKED");
      const nextState:AgentState=v1.task.status==="completed"?"confirmed":v1.task.status==="awaiting_confirmation"?"awaiting_confirmation":v1.task.status==="cancelled"?"cancelled":"collecting";
      await admin.from("conversations").update({state:nextState,context:{draft:v1.task.collectedData,documentId:v1.task.effects.document.ref,collection:{taskStateV1:v1.task}},updated_at:new Date().toISOString()}).eq("id",conversation.id).eq("organization_id",message.organizationId);
      const output:NormalizedOutbound={channel:"whatsapp",conversationId:message.externalConversationId!,kind:"text",text:v1.rendered.text,buttons:v1.rendered.buttons?.map(button=>({id:button.id,label:button.label})),list:v1.rendered.list,replyToExternalMessageId:message.externalMessageId,metadata:{state:nextState,agentVersion:"lume-agent-v1",taskId:v1.task.id,revision:v1.task.revision,legacyAuthorityInvoked:false}};
      if(process.env.WHATSAPP_INBOUND_ONLY!=="true"){
        const sent=await deliverWithRetry(adapter,output);deliveredCount+=1;
        await admin.from("messages").insert({organization_id:message.organizationId,conversation_id:conversation.id,whatsapp_message_id:sent.externalMessageId,direction:"outbound",kind:output.buttons||output.list?"interactive":"text",content:{text:v1.rendered.text,taskId:v1.task.id,revision:v1.task.revision},processing_status:"processed",delivery_status:"sent",delivery_status_updated_at:new Date().toISOString()});
      }
      await admin.from("messages").update({processing_status:"processed"}).eq("organization_id",message.organizationId).eq("whatsapp_message_id",message.externalMessageId);
      await updateJob(admin,message,"responded");
      return{processed:true as const,agentVersion:"lume-agent-v1" as const,legacyAuthorityInvoked:false as const,taskId:v1.task.id,taskRevision:v1.task.revision};
    }
    const agentV1Shadow=mappedTask?runLumeAgentV1({message:text,task:mappedTask.task,today:turnInput.today,now:new Date(message.receivedAt)}):undefined;
    if(taskStateV1Enabled&&mappedTask)turnInput.collection={...turnInput.collection,taskStateV1:agentV1Shadow?.task??mappedTask.task};
    const agentV1Audit=(legacy?:{intent?:string;nextAction?:string;draft?:unknown})=>agentV1Shadow?{mode:agentV1Enabled?"shadow_ready":"task_state_shadow",agent_version:"lume-agent-v1",task_id:agentV1Shadow.task.id,task_revision:agentV1Shadow.task.revision,intent:agentV1Shadow.decision.intent,current_question:agentV1Shadow.task.currentQuestion?.type,patch_fields:agentV1Shadow.patchFields,rejected_patch_fields:agentV1Shadow.rejectedPatchFields,tool_requested:agentV1Shadow.decision.requestedTool,state_migration:mappedTask?.classification,legacy_conflict:mappedTask?.legacyConflict,comparison:compareAgentDecisions({legacy:legacy??{},agent:agentV1Shadow})}:undefined;
    const sendProcessingMessage = async () => {
      if (process.env.WHATSAPP_INBOUND_ONLY === "true") return;
      const markerId = `processing:${message.externalMessageId}`;
      const marker = await admin
        .from("messages")
        .insert({
          organization_id: message.organizationId,
          conversation_id: conversation.id,
          whatsapp_message_id: markerId,
          direction: "outbound",
          kind: "text",
          content: { state, messageTemplateId: "document_processing" },
          processing_status: "processing",
        });
      if (!marker.error) {
        const sent = await deliverWithRetry(adapter, {
          channel: "whatsapp",
          conversationId: message.externalConversationId!,
          kind: "text",
          text: formatLumeMessage(lumeMessages.processing),
          replyToExternalMessageId: message.externalMessageId,
          metadata: { state, messageTemplateId: "document_processing" },
        });
        deliveredCount += 1;
        processingMessageSent = true;
        await admin
          .from("messages")
          .update({
            whatsapp_message_id: sent.externalMessageId,
            processing_status: "processed",
            delivery_status: "sent",
            delivery_status_updated_at: new Date().toISOString(),
          })
          .eq("organization_id", message.organizationId)
          .eq("whatsapp_message_id", markerId);
      } else if (marker.error.code !== "23505")
        throw new Error("PROCESSING_MESSAGE_CLAIM_FAILED");
    };
    const newSessionRequested=!isPromptEligible(collection.activePrompt,state)&&shouldStartNewSession({message:text,state,draft,collection,updatedAt:typeof conversation.updated_at==="string"?conversation.updated_at:undefined,now:new Date(message.receivedAt)});
    const globalNavigation=newSessionRequested?"show_main":resolveGlobalNavigation(text);
    const promptChoice=globalNavigation?undefined:resolveActivePrompt(message.buttonId??text,collection.activePrompt,state);
    const stalePromptButton=message.kind==="button"&&["confirm","correct","cancel"].includes(action)&&!promptChoice;
    if(promptChoice&&collection.activePrompt)turnInput.collection={...turnInput.collection,activePrompt:consumeConversationPrompt(collection.activePrompt)};
    if(globalNavigation)turnInput.collection={...turnInput.collection,activePrompt:undefined,commercialInterpretation:undefined,correctionRequested:false,pendingField:undefined};
    const semanticDocumentAction = promptChoice?.id === "confirm_document" ? "confirm" : promptChoice?.id === "correct_document" ? "correct" : promptChoice?.id === "cancel_document" ? "cancel" : promptChoice?.id === "personalize_now" ? "customize_documents_now" : promptChoice?.id === "not_now" ? "configure_documents_later" : undefined;
    if(promptChoice?.id==="include_cnpj")turnInput.text="sim";
    if(promptChoice?.id==="skip_cnpj")turnInput.text="não precisa";
    if(semanticDocumentAction)action=semanticDocumentAction;else if(promptChoice&&promptActionIds.has(promptChoice.id))action=promptChoice.id as typeof action;else if(promptChoice)action="message";
    if(/^\s*\d+\s*$/.test(text)&&!promptChoice)action="message";
    const transition=classifyIntentTransition({message:text,state,draft,hasActivePrompt:Boolean(collection.activePrompt),correctionRequested:collection.correctionRequested});
    const requestedDraftType:PendingIntentSwitch["to"]|undefined=transition.requested==="document_query"?"document_search":transition.requested==="quote"||transition.requested==="purchase_order"?transition.requested:undefined;
    let transitionResult:Awaited<ReturnType<typeof runAgentTurn>>|undefined;
    if(promptChoice?.id==="start_intent_switch"&&collection.pendingIntentSwitch){
      const pending=collection.pendingIntentSwitch,nextDraft=cleanDraftForIntent(pending.to),nextCollection={...turnInput.collection,pendingIntentSwitch:undefined,activePrompt:undefined,summary:undefined,pendingField:undefined,correctionRequested:false,commercialInterpretation:undefined,party:undefined};
      transitionResult=await runAgentTurn(ctx,{...turnInput,action:pending.to==="quote"?"create_quote":pending.to==="purchase_order"?"create_purchase_order":"search_document",draft:nextDraft,state:"menu",documentId:undefined,collection:nextCollection});
    }else if((promptChoice?.id==="continue_current_task"||promptChoice?.id==="cancel_intent_switch")&&collection.pendingIntentSwitch){
      const labels=switchLabels(collection.pendingIntentSwitch);
      transitionResult={state,draft,documentId:turnInput.documentId,reply:promptChoice.id==="continue_current_task"?`Certo. Vamos continuar o ${labels.current} de onde paramos.`:`Tudo bem. A troca foi cancelada e o ${labels.current} continua preservado.`,provider:"intent-transition",documents:undefined,metrics:undefined,collection:{...turnInput.collection,pendingIntentSwitch:undefined,activePrompt:undefined}};
    }else if(transition.kind==="CONFIRM_SWITCH"&&requestedDraftType&&draft.type){
      const pending={from:draft.type,to:requestedDraftType,requestedAt:new Date(message.receivedAt).toISOString()},labels=switchLabels(pending);
      transitionResult={state,draft,documentId:turnInput.documentId,reply:`Sem problema. Quer abandonar este ${labels.current} e começar um ${labels.task}?`,provider:"intent-transition",documents:undefined,metrics:undefined,collection:{...turnInput.collection,pendingIntentSwitch:pending,activePrompt:undefined}};
    }
    let navigation = globalNavigation?{action:globalNavigation}:promptChoice&&navigationActionIds.has(promptChoice.id)?{action:promptChoice.id as import("@/lib/navigation/menu-engine").MenuAction}:promptChoice||/^\s*\d+\s*$/.test(text)?null:resolveMenuInput(text, collection.navigation);
    let hybridReply:string|undefined, hybridContext=collection.hybrid;
    let vaultReply:string|undefined;
    let vaultFileReference:{url:string;filename:string;mimeType:string}|undefined;
    const normalizedIntent=text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR");
    const vaultSelection=promptChoice?.id.startsWith("vault_file:")?promptChoice.id.slice("vault_file:".length):undefined;
    const asksBusinessTax=/(?:\b(?:qual|informe|mostrar|mostre)\b.*\b(?:meu|minha|empresa)\b.*\bcnpj\b)|(?:\b(?:qual|informe|mostrar|mostre)\b.*\bcnpj\b.*\b(?:meu|minha|empresa)\b)/.test(normalizedIntent);
    const asksFile=/\b(?:envie|encaminhe|mande|procure|busque|localize|encontre)\b/.test(normalizedIntent)&&/\b(?:arquivo|documento|cartao cnpj|contrato|comprovante|proposta|orcamento|pedido|nota fiscal|boleto)\b/.test(normalizedIntent);
    if(vaultSelection){
      vaultFileReference=await signedAdministrativeFileUrl(admin,{organizationId:message.organizationId,fileId:vaultSelection});
      vaultReply="Encontrei o documento solicitado.\n\nVou encaminhá-lo abaixo.";
    }else if(asksBusinessTax){
      const organization=await admin.from("organizations").select("name,legal_name,tax_id").eq("id",message.organizationId).single();
      vaultReply=organization.data?.tax_id?`Localizei estas informações:\n\nRazão social: ${organization.data.legal_name??organization.data.name}\nCNPJ: ${organization.data.tax_id}`:lumeMessages.informationNotFound;
    }else if(asksFile){
      const query=/cartao cnpj|comprovante de inscricao|cadastro da empresa/.test(normalizedIntent)?"cartão CNPJ":/contrato/.test(normalizedIntent)?"contrato":/proposta/.test(normalizedIntent)?"proposta":/comprovante/.test(normalizedIntent)?"comprovante":/orcamento/.test(normalizedIntent)?"orçamento":/pedido/.test(normalizedIntent)?"pedido":text;
      const files=await searchAdministrativeFiles(admin,{organizationId:message.organizationId,query,limit:5});
      if(files.length===1){vaultFileReference=await signedAdministrativeFileUrl(admin,{organizationId:message.organizationId,fileId:files[0].id});vaultReply=`Encontrei ${files[0].document_category==="cartão CNPJ"?"o cartão CNPJ":"o documento solicitado"}.\n\nVou encaminhá-lo abaixo.`;}
      else if(files.length>1){const choices=files.map(file=>({id:file.id,label:`${file.title||file.original_filename} — ${new Intl.DateTimeFormat("pt-BR").format(new Date(file.occurred_at))}`}));vaultReply="Encontrei mais de um documento que pode corresponder ao seu pedido. Escolha na lista abaixo ou descreva qual deles deseja receber.";turnInput.collection={...turnInput.collection,vaultSearch:{query,results:choices}};}
      else if(query==="cartão CNPJ"){const organization=await admin.from("organizations").select("name,legal_name,tax_id").eq("id",message.organizationId).single();vaultReply=organization.data?.tax_id?`Não encontrei um arquivo anexado, mas localizei estas informações:\n\nRazão social: ${organization.data.legal_name??organization.data.name}\nCNPJ: ${organization.data.tax_id}`:lumeMessages.fileNotFound;}
      else vaultReply=lumeMessages.fileNotFound;
    }
    const deterministicNumericAnswer=Boolean(collection.party?.awaitingCnpj);
    const invalidNumericOption=(/^\s*\d+\s*$/.test(text)&&!promptChoice&&!deterministicNumericAnswer)||stalePromptButton;
    if(!transitionResult&&!navigation&&!vaultReply&&!invalidNumericOption&&action==="message"&&!isLumeGreeting(text)&&hybridOrchestratorEnabled("whatsapp")){
      const activeFlow=state==="collecting"&&draft.type?draft.type:undefined,decision=orchestrateHybrid({message:text,channel:"whatsapp",state,activeFlow,draft,context:collection.hybrid,featureFlags:{WHATSAPP_OPERATIONAL_FLOWS_ENABLED:process.env.WHATSAPP_OPERATIONAL_FLOWS_ENABLED==="true",WHATSAPP_CONTENT_FLOWS_ENABLED:process.env.WHATSAPP_CONTENT_FLOWS_ENABLED==="true"},audioConfidence:message.kind==="audio"?(typeof message.metadata.transcriptionConfidence==="number"?message.metadata.transcriptionConfidence:undefined):undefined});
      const routeActions=new Set(["create_quote","create_purchase_order","search_document","search_operations","query_confirmed_values","search_purchase_orders","query_documents_attention","query_customers","query_suppliers","query_catalog","query_management_summary"]);
      if(routeActions.has(decision.suggestedAction)&&(!decision.requiresConfirmation||decision.reasonCode==="explicit_intent_confirmation")){
        navigation={action:decision.suggestedAction as import("@/lib/navigation/menu-engine").MenuAction};
        if(decision.reasonCode==="explicit_intent_confirmation"&&(decision.intent==="create_quote"||decision.intent==="create_purchase_order"))turnInput.draft=applyEntitiesToAgentDraft(draft,decision.entities,decision.intent==="create_quote"?"quote":"purchase_order");
        hybridContext={...collection.hybrid,pendingDecision:undefined,lastIntent:decision.intent,recentEntities:decision.entities};
      }else{
        hybridReply=presentDecision(decision);
        hybridContext=decision.interruptionDetected&&activeFlow?pauseForInterruption(collection.hybrid??{},{flow:activeFlow,draft},decision):{...collection.hybrid,pendingDecision:decision,lastIntent:decision.intent,recentEntities:decision.entities};
      }
    }
    if(hybridContext!==collection.hybrid)turnInput.collection={...turnInput.collection,hybrid:hybridContext};
    const menuTarget = navigation ? destination(navigation.action) : undefined;
    let menuQueryReply:string|null=null, menuQueryFailed=false;
    if(navigation)try{menuQueryReply=await handleWhatsAppMenuQuery(ctx,navigation.action)}catch{menuQueryFailed=true;}
    let result;
    if(transitionResult){
      result=transitionResult;
    } else if(invalidNumericOption){
      result={state,draft,documentId:turnInput.documentId,reply:lumeMessages.invalidPromptOption,provider:"server",documents:undefined,metrics:undefined,collection:{...turnInput.collection,activePrompt:undefined}};
    } else if (vaultReceipt) {
      result={state:"menu" as const,draft,documentId:undefined,reply:vaultReceipt,provider:"administrative-vault",documents:undefined,metrics:undefined,collection:{...turnInput.collection,activePrompt:undefined}};
    } else if(vaultReply){
      const preservesTask=state==="collecting"||state==="awaiting_confirmation";
      result={state:preservesTask?state:"menu" as const,draft,documentId:preservesTask?turnInput.documentId:undefined,reply:`${vaultReply}${preservesTask?`\n\nSeu trabalho atual foi preservado. Quando quiser, diga *continuar* para retomarmos de onde paramos.`:""}`,provider:"administrative-vault",documents:undefined,metrics:undefined,collection:{...turnInput.collection,vaultSearch:vaultFileReference?undefined:turnInput.collection.vaultSearch}};
    } else if (hybridReply) {
      const navigable=renderNavigableResponse(hybridReply,{kind:"free_reply",currentMenu:collection.navigation?.current_menu??"main"});
      result={state:"menu" as const,draft,documentId:undefined,reply:navigable.reply,provider:"hybrid-local",documents:undefined,metrics:undefined,collection:{...collection,hybrid:hybridContext,navigation:{...navigationState(collection.navigation?.current_menu??"main",collection.navigation?.previous_menu),continuation_actions:navigable.options}}};
    } else if (
      newSessionRequested ||
      (isLumeGreeting(text) &&
        ["menu", "cancelled", "confirmed"].includes(state)) ||
      menuTarget ||
      navigation?.action === "back" ||
      navigation?.action === "cancel"
    ) {
      const target = isLumeGreeting(text)
        ? "main"
        : navigation?.action === "back"
          ? collection.navigation?.continuation_actions?.length
            ? safePreviousMenu(collection.navigation?.current_menu)
            : safePreviousMenu(collection.navigation?.previous_menu)
          : navigation?.action === "cancel"
            ? "main"
            : menuTarget!;
      const cancelled = navigation?.action === "cancel";
      const cancelledNavigation=cancelled?renderNavigableResponse(lumeMessages.cancelled,{kind:"cancelled",currentMenu:collection.navigation?.current_menu??"main"}):null;
      result = {
        state: cancelled ? ("cancelled" as const) : ("menu" as const),
        draft: emptyAgentDraft(),
        documentId: undefined,
        reply: cancelledNavigation?.reply ?? (isLumeGreeting(text) ? lumeMessages.opening : renderMenu(target)),
        provider: "server",
        documents: undefined,
        metrics: undefined,
        collection: {
          ...turnInput.collection,
          branding: undefined,
          pendingField: undefined,
          correctionRequested: false,
          commercialInterpretation: undefined,
          navigation: {...navigationState(
            target,
            navigation?.action === "back" ? turnInput.collection.navigation?.previous_menu : turnInput.collection.navigation?.current_menu,
            navigation?.action,
          ),...(cancelledNavigation?{continuation_actions:cancelledNavigation.options}:{})},
        },
      };
    } else if (navigation?.action === "choose_operations_period") {
      const navigable=renderNavigableResponse("Qual período deseja consultar?",{kind:"query_success",currentMenu:"operations",options:[{action:"search_operations_7d",label:"Últimos 7 dias"},{action:"search_operations_30d",label:"Últimos 30 dias"},{action:"search_operations_month",label:"Mês atual"},{action:"back",label:"Voltar"},{action:"show_main",label:"Menu principal"},{action:"talk_to_lume",label:"Falar com a Lume"}]});
      result={state:"menu" as const,draft:emptyAgentDraft(),documentId:undefined,reply:navigable.reply,provider:"server",documents:undefined,metrics:undefined,collection:{...collection,navigation:{...navigationState("operations",collection.navigation?.previous_menu,navigation.action),continuation_actions:navigable.options}}};
    } else if (menuQueryReply || menuQueryFailed) {
      const currentMenu=collection.navigation?.current_menu??"main",queryAction=navigation!.action,empty=Boolean(menuQueryReply&&/^(Nenhum|Não há|Ainda não|As métricas)/i.test(menuQueryReply)),managementActions=new Set(["query_customers","query_suppliers","query_catalog","query_documents","search_operations","query_management_summary"]),options=queryAction==="query_documents"&&empty?[{action:"show_commercial" as const,label:"Criar um documento"},{action:"show_management" as const,label:"Voltar às consultas"}]:managementActions.has(queryAction)?[{action:"show_management" as const,label:"Voltar às consultas"}]:undefined,navigable=renderNavigableResponse(menuQueryFailed?"A consulta não respondeu neste momento. Nenhum dado foi alterado; você pode tentar novamente ou me passar outro critério de busca.":menuQueryReply!,{kind:menuQueryFailed?"recoverable_error":empty?"empty":"query_success",currentMenu,currentAction:queryAction,options});
      result = {
        state: "menu" as const,
        draft: emptyAgentDraft(),
        documentId: undefined,
        reply: navigable.reply,
        provider: "server",
        documents: undefined,
        metrics: undefined,
        collection: {
          ...collection,
          navigation: {...navigationState(currentMenu,collection.navigation?.previous_menu,queryAction),continuation_actions:navigable.options},
        },
      };
    } else {
      if (
        navigation?.action === "create_quote" ||
        navigation?.action === "create_purchase_order" ||
        navigation?.action === "search_document"
      )
        action = navigation.action;
      const resolvedTurnInput={...turnInput,action};
      if(action==="confirm"&&state==="awaiting_confirmation"&&!turnInput.documentId){
        const branding=await activeBranding(ctx);
        if(shouldOfferBranding(typeof branding?.status==="string"?branding.status as import("@/lib/branding/identity").BrandingStatus:undefined)){
          result={state,draft,documentId:turnInput.documentId,reply:"Seus documentos ainda estão usando o modelo padrão. Como deseja emitir este documento?",provider:"pre-emission-branding",documents:undefined,metrics:undefined,collection:{...collection,branding:{state:"offer" as const,preEmission:true}}};
        }else{
          if(shouldSendProcessingMessage(resolvedTurnInput))await sendProcessingMessage();
          result=await runAgentTurn(ctx,resolvedTurnInput);
        }
      }else{
        if(shouldSendProcessingMessage(resolvedTurnInput))await sendProcessingMessage();
        result = await runAgentTurn(ctx, resolvedTurnInput);
      }
    }
    if(result.state==="error"||(result.state==="menu"&&result.draft?.type==="document_search")){
      const currentMenu=collection.navigation?.current_menu??"main",kind=result.state==="error"?"recoverable_error" as const:"query_success" as const,navigable=renderNavigableResponse(result.reply,{kind,currentMenu,currentAction:result.state==="error"?undefined:"search_document"});
      result={...result,reply:navigable.reply,collection:{...result.collection,navigation:{...navigationState(currentMenu,collection.navigation?.previous_menu,result.state==="menu"?"search_document":undefined),continuation_actions:navigable.options}}};
    }
    result={...result,collection:{...result.collection,activePrompt:promptForResult(result)??(result.provider==="administrative-vault"?result.collection.activePrompt:undefined)}};
    result={...result,collection:{...result.collection,activeTask:deriveAdministrativeTask(result.state,result.draft,result.collection)}};
    const experienced = applyConversationExperience({
      message: text,
      state: result.state,
      draft: result.draft,
      collection: result.collection,
      reply: result.reply,
      now: new Date(message.receivedAt),
    });
    result={...result,reply:experienced.reply,collection:experienced.collection};
    if(process.env.LUME_CONVERSATION_V2_SHADOW==="true"){
      try{
        const shadow=runConversationV2Shadow({organizationId:message.organizationId,conversationKey:contactKey,legacyState:state,legacyContext:context,inbound:{text,externalMessageId:message.externalMessageId,receivedAt:message.receivedAt},legacyResult:{state:result.state,draft:result.draft,collection:result.collection,documentId:result.documentId}});
        console.info("conversation.v2.shadow",{classification:shadow.classification,conflicts:shadow.conflicts,legacy:shadow.legacy,v2:shadow.v2,divergences:shadow.divergences,sideEffects:shadow.sideEffects});
        if(process.env.LUME_CONVERSATION_V2_PERSIST_SHADOW==="true")await persistConversationV2ShadowTurn({admin,organizationId:message.organizationId,conversationId:conversation.id,conversationKey:contactKey,externalMessageId:message.externalMessageId,receivedAt:message.receivedAt,text,legacyState:state,legacyContext:context});
      }catch(error){console.warn("conversation.v2.shadow.failed",{code:error instanceof Error?error.message:"UNKNOWN"});}
    }
    conversationState = result.state;
    await admin
      .from("conversations")
      .update({
        state: result.state,
        context: {
          draft: result.draft,
          documentId: result.documentId,
          collection: result.collection,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversation.id)
      .eq("organization_id", message.organizationId);
    let pdfReference: { url: string; filename: string } | undefined;
    let pdfError: string | undefined;
    const documentJustConfirmed=result.state==="confirmed"&&state!=="confirmed";
    const pdfRetryRequested=action==="retry_pdf"&&result.state==="confirmed";
    if ((documentJustConfirmed || pdfRetryRequested) && result.documentId) {
      try {
        pdfReference = await generateStoredDocumentPdf(admin, {
          organizationId: message.organizationId,
          userId: member.user_id,
          documentId: result.documentId,
        });
      } catch (error) {
        pdfError = error instanceof Error ? error.message : "UNKNOWN";
        console.error("whatsapp.pdf.failed", {
          organizationId: message.organizationId,
          documentId: result.documentId,
          code: pdfError,
        });
      }
    }
    let deliveryResult = withPdfDeliveryOutcome(result, pdfError);
    if(documentJustConfirmed&&deliveryResult.state==="confirmed"){
      const branding=pdfError?null:await activeBranding(ctx);
      const personalizationSuggestion=!branding?`\n\n${lumeMessages.brandingOffer}`:"";
      deliveryResult={...deliveryResult,reply:`${deliveryResult.reply}${personalizationSuggestion}`,collection:{...result.collection,summary:undefined,correctionRequested:false,pendingField:undefined,commercialInterpretation:undefined,...(!branding&&!pdfError?{branding:{state:"offer" as const,afterSuccess:true}}:{branding:undefined}),activePrompt:!branding&&!pdfError?createConversationPrompt({promptType:"branding_offer",flowId:"branding_after_success",expectedState:"confirmed",options:[{number:1,id:"personalize_now",label:"Personalizar agora"},{number:2,id:"not_now",label:"Agora não"}]}):undefined}};
      await admin.from("conversations").update({context:{draft:deliveryResult.draft,documentId:deliveryResult.documentId,collection:deliveryResult.collection},updated_at:new Date().toISOString()}).eq("id",conversation.id).eq("organization_id",message.organizationId);
    }
    const outputs = buildAgentWhatsAppOutputs(
      message,
      deliveryResult,
      pdfReference,
    );
    if(vaultFileReference){outputs.push({channel:"whatsapp",conversationId:message.externalConversationId!,kind:vaultFileReference.mimeType.startsWith("image/")?"image":"document",text:"Arquivo localizado pela Lume",mediaReference:vaultFileReference.url,metadata:{filename:vaultFileReference.filename,state:deliveryResult.state}});await admin.from("audit_logs").insert({organization_id:message.organizationId,actor_id:member.user_id,action:"administrative_file.resent",entity_type:"conversation",entity_id:conversation.id,metadata:{filename:vaultFileReference.filename,mimeType:vaultFileReference.mimeType,inboundMessageIdSuffix:message.externalMessageId.slice(-8)}});}
    if (
      result.reply === lumeMessages.brandingPreview &&
      result.collection.branding?.templateId &&
      result.collection.branding.primaryColor
    ) {
      const preview = await generateBrandingPreviewPdf(admin, {
        organizationId: message.organizationId,
        previewKey: conversation.id,
        templateId: result.collection.branding.templateId,
        primaryColor: result.collection.branding.primaryColor,
        logoStoragePath: result.collection.branding.logoStoragePath,
      });
      outputs.splice(Math.max(0, outputs.length - 1), 0, {
        channel: "whatsapp",
        conversationId: message.externalConversationId!,
        kind: "document",
        text: "Prévia da identidade visual • Modelo demonstrativo",
        mediaReference: preview.url,
        metadata: {
          state: result.state,
          filename: preview.filename,
          demonstration: true,
        },
      });
    }
    if (process.env.WHATSAPP_INBOUND_ONLY === "true") {
      await admin
        .from("audit_logs")
        .insert({
          organization_id: message.organizationId,
          actor_id: member.user_id,
          action: "whatsapp.message.processed.inbound_only",
          entity_type: "conversation",
          entity_id: conversation.id,
          metadata: {
            inboundMessageIdSuffix: message.externalMessageId.slice(-8),
            provider: result.provider,
            metrics: result.metrics,
            transcriptionMetrics,
            status: result.state,
            contextualUnderstanding: { intent: result.collection.activeTask?.type, expectedAnswer: result.collection.expectedAnswer, entitiesUpdated: Object.keys(result.collection.provenance ?? {}), entitiesPreserved: result.collection.activeTask?.confirmedData ?? [], entitiesRejected: [], ambiguities: result.collection.activeTask?.ambiguities ?? [], toolUsed: result.provider, confidence: Object.values(result.collection.provenance ?? {}).map((entry) => entry.confidence), nextAction: result.collection.activeTask?.nextAction },
            agentV1:agentV1Audit({intent:result.collection.activeTask?.type,nextAction:result.collection.activeTask?.nextAction,draft:result.draft}),
          },
        });
      await updateJob(admin, message, "responded");
      return { processed: true as const, outboundSuppressed: true as const };
    }
    const sentMessages: Array<{
      externalMessageId: string;
      httpStatus: number;
      latencyMs: number;
      interactiveAttempted?: boolean;
      interactiveSuccess?: boolean;
      fallbackUsed?: boolean;
    }> = [];
    for (const output of outputs) {
      const sent = await deliverWithRetry(adapter, output);
      deliveredCount += 1;
      sentMessages.push(sent);
      await admin
        .from("messages")
        .insert({
          organization_id: message.organizationId,
          conversation_id: conversation.id,
          whatsapp_message_id: sent.externalMessageId,
          direction: "outbound",
          kind: output.buttons?.length ? "interactive" : output.kind,
          content: {
            state: result.state,
            hasButtons: Boolean(output.buttons?.length),
            documentId: output.metadata.documentId,
          },
          processing_status: "processed",
          delivery_status: "sent",
          delivery_status_updated_at: new Date().toISOString(),
        });
    }
    await admin
      .from("messages")
      .update({ processing_status: "processed" })
      .eq("organization_id", message.organizationId)
      .eq("whatsapp_message_id", message.externalMessageId);
    await admin
      .from("audit_logs")
      .insert({
        organization_id: message.organizationId,
        actor_id: member.user_id,
        action: "whatsapp.message.processed",
        entity_type: "conversation",
        entity_id: conversation.id,
        metadata: {
          inboundMessageIdSuffix: message.externalMessageId.slice(-8),
          outboundMessageIdSuffixes: sentMessages.map((sent) =>
            sent.externalMessageId.slice(-8),
          ),
          metaHttpStatuses: sentMessages.map((sent) => sent.httpStatus),
          metaLatencyMs: sentMessages.reduce(
            (total, sent) => total + sent.latencyMs,
            0,
          ),
          interactive_attempted: sentMessages.some((sent) => sent.interactiveAttempted),
          interactive_success: sentMessages.some((sent) => sent.interactiveSuccess),
          fallback_used: sentMessages.some((sent) => sent.fallbackUsed),
          provider: result.provider,
          hybrid: result.collection.hybrid?.pendingDecision ? {intent:result.collection.hybrid.pendingDecision.intent,confidenceLevel:result.collection.hybrid.pendingDecision.confidenceLevel,candidateCount:1+result.collection.hybrid.pendingDecision.alternativeIntents.length,extractedFieldCount:Object.keys(result.collection.hybrid.pendingDecision.entities).length,missingFieldCount:result.collection.hybrid.pendingDecision.missingFields.length,clarificationRequired:result.collection.hybrid.pendingDecision.clarificationRequired,toolProposed:result.collection.hybrid.pendingDecision.toolProposal,confirmationRequired:result.collection.hybrid.pendingDecision.requiresConfirmation,interruptionDetected:result.collection.hybrid.pendingDecision.interruptionDetected,securityEvent:result.collection.hybrid.pendingDecision.securityEvent}:undefined,
          metrics: result.metrics,
          transcriptionMetrics,
          status: result.state,
          contextualUnderstanding: { intent: result.collection.activeTask?.type, expectedAnswer: result.collection.expectedAnswer, entitiesUpdated: Object.keys(result.collection.provenance ?? {}), entitiesPreserved: result.collection.activeTask?.confirmedData ?? [], entitiesRejected: [], ambiguities: result.collection.activeTask?.ambiguities ?? [], toolUsed: result.provider, confidence: Object.values(result.collection.provenance ?? {}).map((entry) => entry.confidence), nextAction: result.collection.activeTask?.nextAction },
          agentV1:agentV1Audit({intent:result.collection.activeTask?.type,nextAction:result.collection.activeTask?.nextAction,draft:result.draft}),
          processingMessageSent,
          messageSignatureApplied: true,
        },
      });
    await updateJob(admin, message, "responded");
    return { processed: true as const };
  } catch (error) {
    const code =
      error instanceof MetaApiError
        ? error.sanitizedType
        : error instanceof Error
          ? error.message
          : "UNKNOWN";
    await updateJob(admin, message, "failed", code.slice(0, 80));
    await admin.from("messages").update({ processing_status: "failed", error_code: code.slice(0, 80) })
      .eq("organization_id", message.organizationId).eq("whatsapp_message_id", message.externalMessageId).eq("direction", "inbound");
    if (deliveredCount === 0 || (processingMessageSent && deliveredCount === 1))
      await adapter
        .deliver(buildWhatsAppError(message, code, conversationState))
        .catch(() => undefined);
    console.error("whatsapp.process.failed", {
      code,
      organizationId: message.organizationId,
      kind: message.kind,
      friendlyErrorType: code,
      processingMessageSent,
    });
    return { failed: true as const };
  } finally {
    await admin.rpc("release_channel_lock", {
      p_lock_key: lockKey,
      p_organization_id: message.organizationId,
    });
  }
}

export async function processWhatsAppEvents(events: ParsedWhatsAppEvent[]) {
  for (const event of events) await processWhatsAppEvent(event);
}
