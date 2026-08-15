import {beforeEach,describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));

const runtime=vi.hoisted(()=>({conversation:null as null|{id:string;state:string;context:Record<string,unknown>},outputs:[] as Array<Record<string,unknown>>,createCount:0,createFailuresRemaining:0,confirmCount:0,pdfCount:0,pdfFailuresRemaining:0,documentDeliveryFailuresRemaining:0,messageSequence:0,brandingConfigured:true,contactRegistered:true,persistedBranding:[] as string[],createdDraft:null as null|Record<string,unknown>}));

vi.mock("@/lib/ai/openai-provider",()=>({
  getAgentAIProvider:()=>({name:"processor-mock",getLastMetrics:()=>undefined,transcribe:vi.fn(),analyze:vi.fn(async(text:string,current:Record<string,unknown>)=>{
    const normalized=text.toLocaleLowerCase("pt-BR");
    const draft={...current};
    if(draft.type&&!draft.counterpartyName&&text.trim())draft.counterpartyName=text.trim();
    if(/5 dias/.test(normalized))draft.deadline="5 dias";
    if(/rua das flores/.test(normalized))draft.deliveryAddress="Rua das Flores, 100, Centro, São Paulo - SP";
    return{intent:draft.type??"unknown",draft,ambiguities:[],reply:"Dados atualizados."};
  })})
}));
vi.mock("@/lib/branding/store",()=>({activeBranding:vi.fn(async()=>runtime.brandingConfigured?{status:"configured"}:null),persistBranding:vi.fn(async(_ctx:unknown,input:{status:string})=>{runtime.brandingConfigured=true;runtime.persistedBranding.push(input.status);return{id:"branding"};})}));
vi.mock("@/lib/whatsapp/menu-queries",()=>({handleWhatsAppMenuQuery:vi.fn(async(_ctx:unknown,action:string)=>action==="query_customers"?"Ainda não existem clientes registrados nesta empresa.":null)}));
vi.mock("@/lib/ai/tools",()=>({
  createAgentDraft:vi.fn(async(_ctx:unknown,draft:Record<string,unknown>)=>{runtime.createCount+=1;if(runtime.createFailuresRemaining>0){runtime.createFailuresRemaining-=1;throw new Error("DRAFT_CREATE_FAILED");}runtime.createdDraft=structuredClone(draft);return{id:"11111111-1111-4111-8111-111111111111",number:"ORC-2026-000001"};}),
  confirmAgentDocument:vi.fn(async(_ctx:unknown,id:string)=>{runtime.confirmCount+=1;return{id,number:runtime.conversation?.context&&((runtime.conversation.context.draft as {type?:string})?.type)==="purchase_order"?"PC-2026-000001":"ORC-2026-000001"};}),
  findContact:vi.fn(async(_ctx:unknown,name:string)=>runtime.contactRegistered?[{id:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",legal_name:name,tax_id:null}]:[]),
  queryDocuments:vi.fn(async()=>[])
}));
vi.mock("@/lib/pdf/store-document",()=>({generateStoredDocumentPdf:vi.fn(async()=>{runtime.pdfCount+=1;if(runtime.pdfFailuresRemaining>0){runtime.pdfFailuresRemaining-=1;throw new Error("PDF_STORAGE_FAILED");}return{url:"https://signed.invalid/document.pdf",filename:"documento.pdf"};})}));
vi.mock("@/lib/pdf/branding-preview",()=>({generateBrandingPreviewPdf:vi.fn()}));
vi.mock("@/lib/branding/image",()=>({validateLogo:vi.fn(async()=>({bytes:new Uint8Array([1,2,3]),extension:"png",mimeType:"image/png"}))}));

vi.mock("@/lib/channels/whatsapp-adapter",async(importOriginal)=>{
  const actual=await importOriginal<typeof import("@/lib/channels/whatsapp-adapter")>();
  class MockAdapter{
    normalize({event,organizationId,actorId}:{event:import("@/lib/channels/whatsapp-adapter").ParsedWhatsAppEvent;organizationId:string;actorId?:string}){return{channel:"whatsapp" as const,externalMessageId:event.externalMessageId,externalConversationId:event.externalConversationId,organizationId,actorId,kind:event.kind,text:event.text,buttonId:event.buttonId,receivedAt:event.receivedAt,metadata:{...event.metadata,phoneNumberId:event.phoneNumberId}};}
    async deliver(output:Record<string,unknown>){if(output.kind==="document"&&runtime.documentDeliveryFailuresRemaining>0){runtime.documentDeliveryFailuresRemaining-=1;throw new Error("META_DOCUMENT_DELIVERY_FAILED");}runtime.outputs.push(output);runtime.messageSequence+=1;return{externalMessageId:`wamid.mock.${runtime.messageSequence}`,httpStatus:200,latencyMs:1};}
    async downloadBrandingLogo(){return new File([new Uint8Array([1,2,3])],"logo.png",{type:"image/png"});}
  }
  return{...actual,WhatsAppChannelAdapter:MockAdapter};
});

class Query{
  private operation="select";private payload:unknown;
  constructor(private table:string){}
  select(){return this;}eq(){return this;}is(){return this;}or(){return this;}order(){return this;}limit(){return this;}
  insert(payload:unknown){this.operation="insert";this.payload=payload;return this;}
  update(payload:unknown){this.operation="update";this.payload=payload;return this;}
  private result(){
    if(this.table==="whatsapp_channels")return{data:{organization_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"},error:null};
    if(this.table==="organization_members")return{data:{user_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"},error:null};
    if(this.table==="conversations"){
      if(this.operation==="insert"){runtime.conversation={id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",state:"menu",context:{draft:(this.payload as {context:unknown}).context?((this.payload as {context:Record<string,unknown>}).context.draft):{}}};return{data:runtime.conversation,error:null};}
      if(this.operation==="update"&&runtime.conversation){const value=this.payload as {state?:string;context?:Record<string,unknown>};runtime.conversation={...runtime.conversation,state:value.state??runtime.conversation.state,context:value.context??runtime.conversation.context};return{data:runtime.conversation,error:null};}
      return{data:runtime.conversation,error:null};
    }
    return{data:null,error:null};
  }
  maybeSingle(){return Promise.resolve(this.result());}single(){return Promise.resolve(this.result());}
  then(resolve:(value:unknown)=>unknown,reject?:(reason:unknown)=>unknown){return Promise.resolve(this.result()).then(resolve,reject);}
}
const db={from:(table:string)=>new Query(table),rpc:vi.fn(async(name:string)=>({data:name==="acquire_channel_lock"?true:true,error:null})),storage:{from:vi.fn(()=>({upload:vi.fn(async()=>({error:null}))}))}};
vi.mock("@/lib/supabase/admin",()=>({createSupabaseAdminClient:()=>db}));

import {processWhatsAppEvent} from "@/lib/whatsapp/processor";

const inbound=(text:string,index:number)=>({phoneNumberId:"phone-br",businessAccountId:"waba",externalMessageId:`wamid.in.${index}`,externalConversationId:"5511999999999",kind:"text" as const,text,receivedAt:`2026-08-05T12:00:${String(index).padStart(2,"0")}.000Z`,metadata:{}});
const inboundButton=(buttonId:string,index:number)=>({phoneNumberId:"phone-br",businessAccountId:"waba",externalMessageId:`wamid.in.${index}`,externalConversationId:"5511999999999",kind:"button" as const,text:buttonId,buttonId,receivedAt:`2026-08-05T12:00:${String(index).padStart(2,"0")}.000Z`,metadata:{}});
const inboundImage=(index:number)=>({phoneNumberId:"phone-br",businessAccountId:"waba",externalMessageId:`wamid.in.${index}`,externalConversationId:"5511999999999",kind:"image" as const,mediaReference:"media-logo",receivedAt:`2026-08-05T12:00:${String(index).padStart(2,"0")}.000Z`,metadata:{mimeType:"image/png"}});
const lastText=()=>String([...runtime.outputs].reverse().find(output=>output.kind==="text")?.text??"");
async function prepareConfirmedSummary(){await processWhatsAppEvent(inbound("Olá, Lume",1));await processWhatsAppEvent(inbound("Faça um orçamento para a empresa Alfa de instalação de três câmeras por R$ 3.800, pagamento à vista e validade de 7 dias.",2));await processWhatsAppEvent(inbound("1",3));await processWhatsAppEvent(inbound("5 dias",4));}

describe("jornada completa pelo processor do WhatsApp",()=>{
  beforeEach(()=>{runtime.conversation=null;runtime.outputs=[];runtime.createCount=0;runtime.createFailuresRemaining=0;runtime.createdDraft=null;runtime.confirmCount=0;runtime.pdfCount=0;runtime.pdfFailuresRemaining=0;runtime.documentDeliveryFailuresRemaining=0;runtime.messageSequence=0;runtime.brandingConfigured=true;runtime.contactRegistered=true;runtime.persistedBranding=[];process.env.WHATSAPP_TEST_RECIPIENT="5511999999999";process.env.WHATSAPP_ACCESS_TOKEN="mock";process.env.WHATSAPP_PHONE_NUMBER_ID="phone-br";delete process.env.WHATSAPP_INBOUND_ONLY;delete process.env.WHATSAPP_HYBRID_ORCHESTRATOR_ENABLED;});

  it("executa o fluxo dourado de orçamento sem menu prematuro ou duplicidade",async()=>{
    await processWhatsAppEvent(inbound("Olá, Lume",1));
    expect(lastText()).toContain("O que precisamos resolver hoje?");
    expect(lastText()).not.toContain("Menu de soluções");

    await processWhatsAppEvent(inbound("Faça um orçamento para a empresa Alfa de instalação de três câmeras por R$ 3.800, pagamento à vista e validade de 7 dias.",2));
    expect(lastText()).toContain("Entendi estas informações");expect(lastText()).toContain("Os R$\u00a03.800,00 correspondem a:");
    let context=runtime.conversation?.context as {draft:{counterpartyName:string;validity:string;items:unknown[]};collection:{activePrompt?:{flowId:string};commercialInterpretation?:unknown;hybrid?:{recentEntities?:Record<string,unknown>}}};
    expect(context.draft).toMatchObject({counterpartyName:"Empresa Alfa",items:[]});expect(context.draft.validity).toMatch(/^2026-08-1[23]$/);expect(context.collection.activePrompt?.flowId).toBe("commercial_value_scope");expect(context.collection.hybrid?.recentEntities).toBeTruthy();

    await processWhatsAppEvent(inbound("1",3));expect(lastText()).toContain("Qual é o prazo de execução do serviço?");
    await processWhatsAppEvent(inbound("5 dias",4));expect(lastText()).toContain("Revise os dados do orçamento");
    context=runtime.conversation?.context as typeof context;expect(context.draft.items).toHaveLength(1);expect((context.collection.activePrompt as {promptType?:string})?.promptType).toBe("confirmation");

    const beforeConfirmation=runtime.outputs.length;await processWhatsAppEvent(inbound("1",5));const terminal=runtime.outputs.slice(beforeConfirmation).map(output=>String(output.text??""));
    expect(terminal[0]).toContain("Estou criando o documento");expect(terminal.at(-2)).toContain("criado com sucesso");expect(terminal.at(-2)).not.toContain("O que deseja fazer agora");expect(terminal.slice(0,-2).join("\n")).not.toContain("Menu de soluções");
    expect(runtime.createCount).toBe(1);expect(runtime.confirmCount).toBe(1);expect(runtime.pdfCount).toBe(1);expect(runtime.outputs.at(-1)?.kind).toBe("document");
  });

  it("executa o fluxo dourado de pedido de compra",async()=>{
    await processWhatsAppEvent(inbound("Olá, Lume",1));
    await processWhatsAppEvent(inbound("Faça um pedido de compra para o fornecedor Beta de três câmeras por R$ 900, valor total, pagamento à vista.",2));expect(lastText()).toContain("Qual é o prazo previsto para entrega?");
    await processWhatsAppEvent(inbound("5 dias",3));expect(lastText()).toContain("endereço completo para entrega");
    await processWhatsAppEvent(inbound("Rua das Flores, 100, Centro, São Paulo - SP",4));expect(lastText()).toContain("Revise os dados do pedido de compra");
    await processWhatsAppEvent(inbound("1",5));expect(runtime.createCount).toBe(1);expect(runtime.pdfCount).toBe(1);expect(lastText()).toContain("criado com sucesso");
  });
  it("menu continua disponível sob solicitação explícita",async()=>{await processWhatsAppEvent(inbound("Olá, Lume",1));await processWhatsAppEvent(inbound("Menu de soluções",2));expect(lastText()).toContain("Estas são as principais soluções");await processWhatsAppEvent(inbound("5",3));expect(lastText()).toContain("O que deseja consultar?");});
  it("rejeita número solto sem prompt ativo",async()=>{await processWhatsAppEvent(inbound("Olá, Lume",1));await processWhatsAppEvent(inbound("9",2));expect(lastText()).toContain("Não consegui relacionar essa resposta");expect(lastText()).not.toContain("Qual informação deseja corrigir");});
  it("reproduz o caso real sem contaminar item e entrega CNPJ em um único componente",async()=>{
    runtime.contactRegistered=false;
    await processWhatsAppEvent(inbound("Olá, Lume",1));await processWhatsAppEvent(inbound("Criar orçamento",2));await processWhatsAppEvent(inbound("Alfa",3));await processWhatsAppEvent(inbound("São 20 lâmpadas, 30 reais cada",4));
    let context=runtime.conversation?.context as {draft:Record<string,unknown>;collection:Record<string,unknown>};
    expect(context.draft).toMatchObject({itemType:"product",totalPrice:600,items:[{description:"lâmpadas",quantity:20,unitPrice:30}]});expect(lastText()).toContain("prazo de entrega");
    await processWhatsAppEvent(inbound("20 dias",5));await processWhatsAppEvent(inbound("cartão de crédito 2 vezes",6));context=runtime.conversation?.context as typeof context;
    expect(context.draft).toMatchObject({deadline:"20 dias",paymentTerms:"Cartão de crédito em 2 vezes",paymentDetails:{method:"credit_card",installments:2},items:[{description:"lâmpadas",quantity:20,unitPrice:30}]});
    await processWhatsAppEvent(inbound("30 dias",7));const cnpjOutput=runtime.outputs.at(-1) as {text?:string;buttons?:Array<{id:string}>};
    expect(cnpjOutput.text?.match(/Deseja incluir o CNPJ/g)).toHaveLength(1);expect(cnpjOutput.text).not.toMatch(/1\s+—\s+Sim|2\s+—/);expect(cnpjOutput.buttons?.map(button=>button.id)).toEqual(["include_cnpj","skip_cnpj"]);
    await processWhatsAppEvent(inbound("Não precisa",8));expect(lastText()).toContain("Produto: lâmpadas");expect(lastText()).toContain("Pagamento: Cartão de crédito em 2 vezes");expect(lastText()).toContain("Prazo de entrega: 20 dias");
    const summaryOutput=runtime.outputs.at(-1) as {buttons?:Array<{id:string}>};expect(summaryOutput.buttons?.map(button=>button.id)).toEqual(["confirm_document","correct_document","cancel_document"]);
    await processWhatsAppEvent(inbound("Corrigir informações",9));await processWhatsAppEvent(inbound("Alterar o item para lâmpadas LED",10));context=runtime.conversation?.context as typeof context;
    expect(context.draft).toMatchObject({paymentTerms:"Cartão de crédito em 2 vezes",deadline:"20 dias",items:[{description:"lampadas led",quantity:20,unitPrice:30}]});
  });
  it("processa atomicamente a mensagem composta da homologação real",async()=>{
    runtime.contactRegistered=false;
    await processWhatsAppEvent(inbound("Preciso fazer um orçamento para a Alfa.\nSão 20 lâmpadas a R$ 30 cada.\nPrazo de 20 dias.\nCartão de crédito em 2 vezes.",1));
    const context=runtime.conversation?.context as {draft:Record<string,unknown>};
    expect(context.draft).toMatchObject({itemType:"product",items:[{description:"Lâmpadas",quantity:20,unitPrice:30}],totalPrice:600,paymentTerms:"Cartão de crédito em 2 vezes",paymentDetails:{method:"credit_card",installments:2,display:"Cartão de crédito em 2 vezes"}});
    expect(JSON.stringify(context.draft)).not.toMatch(/"description":"vezes"|"paymentTerms":"cartao"/i);
  });
  it("adia criação e PDF até a escolha explícita pelo modelo padrão",async()=>{
    runtime.brandingConfigured=false;await prepareConfirmedSummary();await processWhatsAppEvent(inbound("Confirmar",5));
    expect(runtime.createCount).toBe(0);expect(runtime.pdfCount).toBe(0);expect(lastText()).toContain("Como deseja emitir este documento");
    expect((runtime.outputs.at(-1)?.buttons as Array<{id:string}>).map(button=>button.id)).toEqual(["emit_default_document","customize_documents_now"]);
    await processWhatsAppEvent(inbound("Emitir com modelo padrão",6));expect(runtime.createCount).toBe(1);expect(runtime.confirmCount).toBe(1);expect(runtime.pdfCount).toBe(1);expect(lastText()).toContain("criado com sucesso");
  });
  it("aguarda logo válida antes de criar documento e reutiliza identidade",async()=>{
    runtime.brandingConfigured=false;await prepareConfirmedSummary();await processWhatsAppEvent(inbound("Confirmar",5));await processWhatsAppEvent(inbound("Personalizar agora",6));
    expect(runtime.createCount).toBe(0);expect(runtime.pdfCount).toBe(0);expect(lastText()).toContain("Me envie a logo");
    await processWhatsAppEvent(inbound("texto aleatório",7));expect(runtime.createCount).toBe(0);expect(lastText()).toContain("aguardando a logo");
    await processWhatsAppEvent(inboundImage(8));expect(runtime.persistedBranding).toContain("configured");expect(runtime.createCount).toBe(1);expect(runtime.confirmCount).toBe(1);expect(runtime.pdfCount).toBe(1);
  });
  it("permite emitir sem logo durante a espera sem duplicar documento",async()=>{
    runtime.brandingConfigured=false;await prepareConfirmedSummary();await processWhatsAppEvent(inbound("Confirmar",5));await processWhatsAppEvent(inbound("Personalizar agora",6));await processWhatsAppEvent(inbound("pode emitir sem logo",7));
    expect(runtime.createCount).toBe(1);expect(runtime.confirmCount).toBe(1);expect(runtime.pdfCount).toBe(1);expect(runtime.persistedBranding).not.toContain("default");
  });
  it("mantém o checkpoint confirmado e recupera o PDF sem duplicar documento",async()=>{
    runtime.pdfFailuresRemaining=1;await prepareConfirmedSummary();await processWhatsAppEvent(inbound("Confirmar",5));
    expect(runtime.conversation?.state).toBe("confirmed");expect(runtime.conversation?.context.documentId).toBe("11111111-1111-4111-8111-111111111111");expect(runtime.createCount).toBe(1);expect(runtime.confirmCount).toBe(1);expect(runtime.pdfCount).toBe(1);expect(lastText()).toContain("não consegui preparar o PDF");
    await processWhatsAppEvent(inboundButton("retry_pdf",6));
    expect(runtime.createCount).toBe(1);expect(runtime.confirmCount).toBe(1);expect(runtime.pdfCount).toBe(2);expect(runtime.outputs.at(-1)?.kind).toBe("document");
  });
  it("recupera falha anterior ao documento a partir do resumo preservado",async()=>{
    runtime.createFailuresRemaining=1;await prepareConfirmedSummary();await processWhatsAppEvent(inboundButton("confirm_document",5));
    expect(runtime.conversation?.state).toBe("awaiting_confirmation");expect(runtime.conversation?.context.documentId).toBeUndefined();expect(runtime.createCount).toBe(1);expect((runtime.outputs.at(-1)?.buttons as Array<{id:string}>).map(button=>button.id)).toEqual(["confirm_document","correct_document"]);
    await processWhatsAppEvent(inboundButton("confirm_document",6));
    expect(runtime.createCount).toBe(2);expect(runtime.confirmCount).toBe(1);expect(runtime.pdfCount).toBe(1);expect(runtime.outputs.at(-1)?.kind).toBe("document");
  });
  it("reutiliza documento e PDF depois de falha no outbound da Meta",async()=>{
    runtime.documentDeliveryFailuresRemaining=1;await prepareConfirmedSummary();await processWhatsAppEvent(inboundButton("confirm_document",5));
    expect(runtime.conversation?.state).toBe("confirmed");expect(runtime.createCount).toBe(1);expect(runtime.confirmCount).toBe(1);expect(runtime.pdfCount).toBe(1);
    await processWhatsAppEvent(inbound("Gerar PDF",6));
    expect(runtime.createCount).toBe(1);expect(runtime.confirmCount).toBe(1);expect(runtime.pdfCount).toBe(2);expect(runtime.outputs.at(-1)?.kind).toBe("document");
  });
  it("executa transcript completo com CNPJ livre e emissão padrão",async()=>{
    runtime.contactRegistered=false;runtime.brandingConfigured=false;
    await processWhatsAppEvent(inbound("Preciso fazer um orçamento para a Alfa de 20 lâmpadas a R$30 cada, prazo de 20 dias e pagamento no cartão em 2 vezes.",1));
    await processWhatsAppEvent(inbound("30 dias",2));await processWhatsAppEvent(inboundButton("include_cnpj",3));await processWhatsAppEvent(inbound("09557452000143",4));
    const reviewed=runtime.conversation?.context as {collection:{party:{taxId:string};activePrompt?:unknown}};expect(reviewed.collection.party.taxId).toBe("09.557.452/0001-43");expect(lastText()).toContain("09.557.452/0001-43");
    await processWhatsAppEvent(inboundButton("confirm_document",5));await processWhatsAppEvent(inboundButton("emit_default_document",6));
    expect(runtime.createCount).toBe(1);expect(runtime.confirmCount).toBe(1);expect(runtime.pdfCount).toBe(1);expect(runtime.outputs.at(-1)?.kind).toBe("document");expect(lastText()).not.toMatch(/1\s+—\s+/);expect((runtime.conversation?.context.collection as {activePrompt?:{flowId:string}}).activePrompt?.flowId).toBe("branding_after_success");
  });
  it("preserva lâmpadas até o objeto entregue à persistência",async()=>{
    await processWhatsAppEvent(inbound("Olá, Lume",1));await processWhatsAppEvent(inbound("Criar orçamento",2));await processWhatsAppEvent(inbound("Alfa",3));await processWhatsAppEvent(inbound("São 20 lâmpadas a R$ 30 cada",4));await processWhatsAppEvent(inbound("20 dias",5));await processWhatsAppEvent(inbound("cartão de crédito em 2 vezes",6));await processWhatsAppEvent(inbound("30 dias",7));
    await processWhatsAppEvent(inbound("Não precisa",8));await processWhatsAppEvent(inbound("Pode emitir",9));
    expect(runtime.createdDraft).toMatchObject({paymentTerms:"Cartão de crédito em 2 vezes",items:[{description:"lâmpadas",quantity:20,unitPrice:30}]});
  });
  it("branding pós-sucesso consome ‘Gostaria sim’ sem reabrir resumo ou documento",async()=>{
    const draft={type:"quote",counterpartyName:"Alfa",items:[{description:"lampadas",quantity:20,unit:"un",unitPrice:30,discount:0}],shipping:0,validity:"2026-09-13",deadline:"20 dias",paymentTerms:"Cartão de crédito em 2 vezes",deliveryAddress:null,notes:null,documentQuery:null,itemType:"product"};
    const now=new Date().toISOString();runtime.conversation={id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",state:"confirmed",context:{draft,documentId:"11111111-1111-4111-8111-111111111111",collection:{branding:{state:"offer",afterSuccess:true},activePrompt:{promptId:"branding_after_success",promptType:"branding_offer",options:[{number:1,id:"personalize_now",label:"Personalizar agora"},{number:2,id:"not_now",label:"Agora não"}],presentedAt:now,flowId:"branding_after_success",version:"2026-08-commercial-baseline-v3",expectedState:"confirmed"}}}};
    await processWhatsAppEvent(inbound("Gostaria sim",10));const context=runtime.conversation.context as {collection:{branding:{state:string};activePrompt?:{flowId:string}}};
    expect(runtime.conversation.state).toBe("confirmed");expect(context.collection.branding.state).toBe("awaiting_logo");expect(context.collection.activePrompt?.flowId).toBe("branding_after_success");expect(lastText()).toContain("Me envie a logo");expect(lastText()).not.toContain("Revise os dados");expect(runtime.createCount).toBe(0);
  });
  it("confirma troca incompatível e inicia pedido sem contaminar dados do orçamento",async()=>{
    await processWhatsAppEvent(inbound("Criar orçamento",1));await processWhatsAppEvent(inbound("Alfa",2));await processWhatsAppEvent(inbound("20 cadeiras a R$ 250 cada",3));
    const before=structuredClone(runtime.conversation?.context.draft);await processWhatsAppEvent(inbound("qual é o CNPJ da minha empresa?",4));expect(runtime.conversation?.context.draft).toEqual(before);
    await processWhatsAppEvent(inbound("continua",5));expect(runtime.conversation?.context.draft).toEqual(before);
    await processWhatsAppEvent(inbound("Esquece isso, quero fazer um pedido de compra",6));
    let context=runtime.conversation?.context as {draft:Record<string,unknown>;collection:{pendingIntentSwitch?:Record<string,string>;activePrompt?:{flowId:string}}};
    expect(context.draft).toEqual(before);expect(context.collection.pendingIntentSwitch).toMatchObject({from:"quote",to:"purchase_order"});expect(context.collection.activePrompt?.flowId).toBe("intent_switch:quote:purchase_order");
    expect((runtime.outputs.at(-1)?.buttons as Array<{id:string}>).map(button=>button.id)).toEqual(["start_intent_switch","continue_current_task","cancel_intent_switch"]);
    await processWhatsAppEvent(inbound("sim, começa o pedido",7));context=runtime.conversation?.context as typeof context;
    expect(context.draft).toMatchObject({type:"purchase_order",counterpartyName:null,items:[]});expect(context.collection.pendingIntentSwitch).toBeUndefined();expect(lastText()).toContain("fornecedor");
  });
  it("permite recusar troca e preserva integralmente a tarefa atual",async()=>{
    await processWhatsAppEvent(inbound("Criar orçamento",1));await processWhatsAppEvent(inbound("Alfa",2));const before=structuredClone(runtime.conversation?.context.draft);
    await processWhatsAppEvent(inbound("quero fazer um pedido de compra",3));await processWhatsAppEvent(inbound("continua o orçamento",4));
    const context=runtime.conversation?.context as {draft:Record<string,unknown>;collection:{pendingIntentSwitch?:unknown}};expect(context.draft).toEqual(before);expect(context.collection.pendingIntentSwitch).toBeUndefined();expect(lastText()).toContain("continuar o orçamento");
  });
  it("trata consulta administrativa como interrupção temporária",async()=>{
    await processWhatsAppEvent(inbound("Criar orçamento",1));await processWhatsAppEvent(inbound("Alfa",2));const before=structuredClone(runtime.conversation?.context.draft);
    await processWhatsAppEvent(inbound("qual é o CNPJ da minha empresa?",3));
    const context=runtime.conversation?.context as {draft:Record<string,unknown>};expect(context.draft).toEqual(before);expect(runtime.conversation?.state).toBe("collecting");expect(lastText()).toContain("trabalho atual foi preservado");
  });
  it("reproduz o transcript real e consolida contraparte, produto e prazo no processor",async()=>{
    await processWhatsAppEvent(inbound("Olá",1));
    await processWhatsAppEvent(inbound("Preciso fazer um orçamento para a Alfa de 20 lâmpadas a R$30 cada, prazo de 20 dias e pagamento no cartão em 2 vezes.",2));
    const context=runtime.conversation?.context as {draft:Record<string,unknown>;collection:Record<string,unknown>};
    expect(context.draft).toMatchObject({type:"quote",counterpartyName:"Alfa",itemType:"product",items:[{description:"Lâmpadas",quantity:20,unitPrice:30}],deadline:"20 dias",paymentTerms:"Cartão de crédito em 2 vezes",validity:null});
    expect(lastText()).toContain("Produto: Lâmpadas");expect(lastText()).not.toContain("Serviço: Lâmpadas");expect(lastText()).not.toContain("Qual é o nome ou a razão social");expect(lastText()).toMatch(/válid/i);
  });
  it("consome resposta curta de contraparte antes do provider amplo e não repete o prompt",async()=>{
    runtime.conversation={id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",state:"collecting",context:{draft:{type:"quote",counterpartyName:null,items:[],shipping:0,validity:null,deadline:null,paymentTerms:null,deliveryAddress:null,notes:null,documentQuery:null,quotedAmount:null,amountScope:null,quotedQuantity:null,quotedItemDescription:null,totalPrice:null,itemType:null,paymentDetails:null},collection:{pendingField:"cliente",expectedAnswer:"counterparty"}}};
    await processWhatsAppEvent(inbound("Alfa Ltda",1));const context=runtime.conversation.context as {draft:{counterpartyName:string};collection:{expectedAnswer?:string}};
    expect(context.draft.counterpartyName).toBe("Alfa Ltda");expect(context.collection.expectedAnswer).not.toBe("counterparty");expect(lastText()).toContain("produto ou serviço");expect(lastText()).not.toContain("nome ou a razão social");
  });
  it("permite troca de intenção enquanto aguarda contraparte",async()=>{
    runtime.conversation={id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",state:"collecting",context:{draft:{type:"quote",counterpartyName:null,items:[],shipping:0,validity:null,deadline:null,paymentTerms:null,deliveryAddress:null,notes:null,documentQuery:null,quotedAmount:null,amountScope:null,quotedQuantity:null,quotedItemDescription:null,totalPrice:null,itemType:null,paymentDetails:null},collection:{pendingField:"cliente",expectedAnswer:"counterparty"}}};
    await processWhatsAppEvent(inbound("esquece isso, quero fazer um pedido de compra",1));const context=runtime.conversation.context as {draft:{counterpartyName:null;type:string};collection:{pendingIntentSwitch?:{from:string;to:string}}};
    expect(context.draft).toMatchObject({type:"quote",counterpartyName:null});expect(context.collection.pendingIntentSwitch).toEqual(expect.objectContaining({from:"quote",to:"purchase_order"}));expect(lastText()).toContain("começar um pedido");
  });
});
