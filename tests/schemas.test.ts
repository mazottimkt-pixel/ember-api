import { describe,expect,it } from "vitest";import { documentSchema } from "@/lib/domain/schemas";
const base={counterpartyName:"Clínica Alfa",items:[{description:"Manutenção",quantity:12,unit:"un",unitPrice:180,discount:0}],shipping:0,deadline:"5 dias",paymentTerms:"50/50"};
describe("documentSchema",()=>{it("aceita orçamento completo",()=>expect(documentSchema.safeParse({...base,type:"quote",validity:"15 dias"}).success).toBe(true));it("exige endereço em pedido",()=>expect(documentSchema.safeParse({...base,type:"purchase_order"}).success).toBe(false))});
