import {beforeEach,describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const {analyze}=vi.hoisted(()=>({analyze:vi.fn()}));
vi.mock("@/lib/ai/openai-provider",()=>({getAgentAIProvider:()=>({name:"mock",analyze,getLastMetrics:()=>undefined})}));
vi.mock("@/lib/ai/tools",()=>({createAgentDraft:vi.fn(),confirmAgentDocument:vi.fn(),findContact:vi.fn(async()=>[{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",legal_name:"Empresa Alfa",tax_id:null}]),queryDocuments:vi.fn()}));
import {runAgentTurn} from "@/lib/ai/turn";
import {emptyAgentDraft} from "@/lib/ai/contracts";

const ctx={organizationId:crypto.randomUUID(),userId:crypto.randomUUID(),supabase:{} as never};
const phrase="Faça um orçamento para a empresa Alfa de instalação de três câmeras por R$ 3.800, pagamento à vista e validade de 7 dias.";

describe("mensagem comercial composta",()=>{
  beforeEach(()=>analyze.mockReset());
  it("extrai a frase oficial durante coleta e preserva tudo ao desambiguar",async()=>{
    const first=await runAgentTurn(ctx,{action:"message",text:phrase,idempotencyKey:crypto.randomUUID(),state:"collecting",draft:{...emptyAgentDraft(),type:"quote"},collection:{},today:"2026-08-05"});
    expect(first.provider).toBe("commercial-entities");
    expect(first.reply).toContain("Entendi estas informações:");
    expect(first.reply).toContain("Cliente: Empresa Alfa");
    expect(first.reply).toContain("R$\u00a03.800,00");
    expect(first.reply).toContain("Os R$\u00a03.800,00 correspondem a:");
    expect(first.reply).toContain("1 — Valor de cada unidade");
    expect(first.draft.counterpartyName).toBe("Empresa Alfa");
    expect(first.draft.paymentTerms).toBe("À vista");
    expect(first.draft.validity).toMatch(/^2026-08-1[23]$/);
    expect(first.draft.items).toEqual([]);
    expect(first.collection.commercialInterpretation?.entities.price).toMatchObject({value:3800,source:"user_message"});
    expect(analyze).not.toHaveBeenCalled();

    const second=await runAgentTurn(ctx,{action:"message",text:"2",idempotencyKey:crypto.randomUUID(),state:first.state,draft:first.draft,collection:first.collection,today:"2026-08-05"});
    expect(second.draft.items).toEqual([{description:"Instalação de três câmeras",quantity:3,unit:"un",unitPrice:3800/3,discount:0}]);
    expect(second.reply).toContain("Qual é o prazo de execução do serviço?");
    expect(second.collection.commercialInterpretation).toBeUndefined();
    expect(second.draft).toMatchObject({quotedAmount:3800,amountScope:"total",quotedQuantity:3,totalPrice:3800});
  });

  it("não confunde prazo com validade",async()=>{
    analyze.mockResolvedValue({intent:"quote",ambiguities:[],reply:"ok",draft:{...emptyAgentDraft(),type:"quote",counterpartyName:"Empresa Alfa",items:[{description:"Serviço",quantity:1,unit:"un",unitPrice:100,discount:0}],shipping:0,deadline:"5 dias",paymentTerms:"À vista",validity:null,deliveryAddress:null,notes:null,documentQuery:null}});
    const base={...emptyAgentDraft(),type:"quote" as const,counterpartyName:"Empresa Alfa",items:[{description:"Serviço",quantity:1,unit:"un",unitPrice:100,discount:0}],deadline:"5 dias",paymentTerms:"À vista"};
    const result=await runAgentTurn(ctx,{action:"message",text:"validade de 7 dias",idempotencyKey:crypto.randomUUID(),state:"collecting",draft:base,collection:{pendingField:"validade",party:{source:"registered",name:"Empresa Alfa",contactId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}},today:"2026-08-05"});
    expect(result.draft.deadline).toBe("5 dias");expect(result.draft.validity).toBe("2026-08-12");
  });
});
