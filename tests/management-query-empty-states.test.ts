import {describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/dashboard/metrics",()=>({loadDashboardData:vi.fn(async()=>({metrics:{quoteCount:0,confirmedQuoteCount:0,confirmedQuoteValue:0,purchaseOrderCount:0,purchaseOrderTotal:0,pendingPurchaseOrderCount:0,attention:[],negotiationValue:0},operationalMetrics:{orderCount:0,inProgress:0,overdue:0,checklistsWithIssues:0,reportsPending:0}}))}));
import {handleWhatsAppMenuQuery} from "@/lib/whatsapp/menu-queries";

class EmptyQuery{select(){return this;}eq(){return this;}is(){return this;}order(){return this;}limit(){return this;}then(resolve:(value:unknown)=>unknown){return Promise.resolve({data:[],error:null}).then(resolve);}}
const ctx={organizationId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",supabase:{from:vi.fn(()=>new EmptyQuery())}} as never;
describe("estados vazios de Consultas e gestão",()=>{
  it.each([["query_customers","Ainda não existem clientes"],["query_suppliers","Ainda não existem fornecedores"],["query_catalog","Ainda não existem produtos ou serviços"],["query_documents","Ainda não existem documentos"],["search_operations","Ainda não existem operações"],["query_management_summary","Ainda não há informações suficientes"]] as const)("%s possui handler contextual",async(action,expected)=>expect(await handleWhatsAppMenuQuery(ctx,action)).toContain(expected));
});
