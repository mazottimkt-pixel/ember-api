import {beforeEach,describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const mocks=vi.hoisted(()=>({findContact:vi.fn(),createAgentDraft:vi.fn(),confirmAgentDocument:vi.fn()}));
vi.mock("@/lib/ai/tools",()=>({...mocks,queryDocuments:vi.fn()}));
vi.mock("@/lib/branding/store",()=>({activeBranding:vi.fn(async()=>({status:"configured"})),persistBranding:vi.fn()}));
import {runAgentTurn,shouldSendProcessingMessage} from "@/lib/ai/turn";
import {buildAgentReviewSummary} from "@/lib/ai/summary";
import type {AgentDraft} from "@/lib/ai/contracts";

const draft:AgentDraft={type:"purchase_order",counterpartyName:"Empresa Alfa",items:[{description:"Câmera",quantity:3,unit:"un",unitPrice:100,discount:0}],shipping:0,validity:null,deadline:"5 dias",paymentTerms:"À vista",deliveryAddress:"Rua A, 1",notes:null,documentQuery:null};
const ctx={organizationId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",userId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"} as never;
describe("contraparte avulsa",()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.findContact.mockResolvedValue([]);mocks.createAgentDraft.mockResolvedValue({id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc"});mocks.confirmAgentDocument.mockResolvedValue({id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",number:"PC-2026-000001"});});
  it("pergunta CNPJ, aceita ausência intencional e preserva snapshot",async()=>{
    const initialSummary=buildAgentReviewSummary(draft);
    const asked=await runAgentTurn(ctx,{action:"confirm",text:"Confirmar",idempotencyKey:"one",state:"awaiting_confirmation",draft,collection:{summary:initialSummary}});
    expect(asked.reply).toContain("Deseja incluir o CNPJ");expect(asked.collection.party).toMatchObject({source:"ad_hoc",awaitingCnpjDecision:true});
    const reviewed=await runAgentTurn(ctx,{action:"message",text:"Não precisa",idempotencyKey:"two",state:"collecting",draft,collection:asked.collection});
    expect(reviewed.state).toBe("awaiting_confirmation");expect(reviewed.reply).toContain("CNPJ");expect(reviewed.reply).toContain("Não informado");
    expect(shouldSendProcessingMessage({action:"confirm",state:reviewed.state,draft,collection:reviewed.collection})).toBe(true);
    await runAgentTurn(ctx,{action:"confirm",text:"Confirmar",idempotencyKey:"three",state:reviewed.state,draft,collection:reviewed.collection});
    expect(mocks.createAgentDraft).toHaveBeenCalledWith(ctx,draft,expect.any(String),expect.objectContaining({source:"ad_hoc",name:"Empresa Alfa",taxId:undefined}));
  });
});
