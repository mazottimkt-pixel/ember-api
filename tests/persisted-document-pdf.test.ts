import {describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {persistedDocumentPdfInput} from "@/lib/pdf/store-document";
import {emptyAgentDraft} from "@/lib/ai/contracts";
import {persistedDocumentItemRows} from "@/lib/ai/tools";

describe("fronteira persistência → PDF",()=>{
  it("cria a linha persistida com lâmpadas, não com entidade de pagamento",()=>{
    const rows=persistedDocumentItemRows("org","doc",{...emptyAgentDraft(),type:"quote",counterpartyName:"Alfa",items:[{description:"Lâmpadas",quantity:20,unit:"un",unitPrice:30,discount:0}],paymentTerms:"Cartão de crédito em 2 vezes"});
    expect(rows).toEqual([{organization_id:"org",document_id:"doc",position:1,description:"Lâmpadas",quantity:20,unit:"un",unit_price:30,discount:0,line_total:600}]);
  });
  it("preserva item e pagamento finais do registro persistido",()=>{
    const input=persistedDocumentPdfInput({type:"quote",counterparty_snapshot:{name:"Alfa"},document_items:[{description:"Lâmpadas",quantity:20,unit:"un",unit_price:30,discount:0}],shipping:0,commercial_terms:{validity:"2026-09-13",deadline:"20 dias",paymentTerms:"Cartão de crédito em 2 vezes"},notes:null});
    expect(input).toMatchObject({counterpartyName:"Alfa",items:[{description:"Lâmpadas",quantity:20,unitPrice:30}],paymentTerms:"Cartão de crédito em 2 vezes",deadline:"20 dias"});
  });
});
