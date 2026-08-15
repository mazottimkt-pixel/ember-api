import { describe,expect,it,vi } from "vitest";
import { createTaskState } from "@/lib/agent-v1/task-state";
import { emptyAgentDraft } from "@/lib/ai/contracts";
import { presentTaskConfirmation,confirmTask } from "@/lib/agent-v1/lifecycle";
import { executeRegisteredTool } from "@/lib/agent-v1/tool-registry";

const ready=()=>{const base=createTaskState("quote",{id:"00000000-0000-4000-8000-000000000000",draft:{...emptyAgentDraft(),type:"quote",counterpartyName:"Alfa",items:[{description:"Lâmpadas",quantity:20,unit:"un",unitPrice:30,discount:0}],deadline:"20 dias",paymentTerms:"PIX",validity:"2026-09-12",itemType:"product",totalPrice:600}});return confirmTask(presentTaskConfirmation(base),{taskId:base.id,revision:base.revision});};

describe("efeitos transacionais Agent V1",()=>{
  it("retoma após falha de PDF sem recriar documento",async()=>{
    const base=createTaskState("quote",{id:"00000000-0000-4000-8000-000000000000",draft:{...emptyAgentDraft(),type:"quote",counterpartyName:"Alfa",items:[{description:"Lâmpadas",quantity:20,unit:"un",unitPrice:30,discount:0}],deadline:"20 dias",paymentTerms:"PIX",validity:"2026-09-12",itemType:"product",totalPrice:600}});
    const executing=confirmTask(presentTaskConfirmation(base),{taskId:base.id,revision:base.revision});
    const create=vi.fn(async()=>({resultRef:'{"documentId":"11111111-1111-4111-8111-111111111111","number":"ORC-1"}'})),pdf=vi.fn().mockRejectedValueOnce(new Error("PDF_STORAGE_FAILED")).mockResolvedValue({resultRef:'{"url":"https://example.test/a.pdf","filename":"a.pdf"}'}),send=vi.fn(async()=>({resultRef:"wamid.out.1"}));
    const failed=await executeRegisteredTool(executing,{create_quote:create,create_purchase_order:create,generate_document_pdf:pdf,send_document:send});
    expect(failed.task.effects).toMatchObject({document:{status:"completed"},pdf:{status:"failed_recoverable"},delivery:{status:"pending"}});
    const retry={...failed.task,status:"executing" as const,toolExecution:{...failed.task.toolExecution,status:"executing" as const}};
    const completed=await executeRegisteredTool(retry,{create_quote:create,create_purchase_order:create,generate_document_pdf:pdf,send_document:send});
    expect(completed.task.status).toBe("completed");expect(create).toHaveBeenCalledTimes(1);expect(pdf).toHaveBeenCalledTimes(2);expect(send).toHaveBeenCalledTimes(1);
  });
  it("retoma após falha de outbound sem recriar documento ou PDF",async()=>{
    const task=ready(),create=vi.fn(async()=>({resultRef:'{"documentId":"11111111-1111-4111-8111-111111111111","number":"ORC-1"}'})),pdf=vi.fn(async()=>({resultRef:'{"url":"https://example.test/a.pdf","filename":"a.pdf"}'})),send=vi.fn().mockRejectedValueOnce(new Error("GRAPH_FAILED")).mockResolvedValue({resultRef:"wamid.out.1"});
    const failed=await executeRegisteredTool(task,{create_quote:create,create_purchase_order:create,generate_document_pdf:pdf,send_document:send});
    const retry={...failed.task,status:"executing" as const,toolExecution:{...failed.task.toolExecution,status:"executing" as const}},done=await executeRegisteredTool(retry,{create_quote:create,create_purchase_order:create,generate_document_pdf:pdf,send_document:send});
    expect(done.task.effects.delivery).toMatchObject({status:"completed",wamid:"wamid.out.1"});expect(create).toHaveBeenCalledTimes(1);expect(pdf).toHaveBeenCalledTimes(1);expect(send).toHaveBeenCalledTimes(2);
  });
});
