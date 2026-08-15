import { describe,expect,it,vi } from "vitest";
import { emptyAgentDraft } from "@/lib/ai/contracts";
import { createTaskState } from "@/lib/agent-v1/task-state";
import { beginInterruption, completeInterruption, confirmTask, presentTaskConfirmation } from "@/lib/agent-v1/lifecycle";
import { decodeBoundAction, encodeBoundAction, validateBoundAction } from "@/lib/agent-v1/interactions";
import { executeRegisteredTool } from "@/lib/agent-v1/tool-registry";
const complete=()=>createTaskState("quote",{draft:{...emptyAgentDraft(),type:"quote",counterpartyName:"Alfa",items:[{description:"Lâmpadas",quantity:20,unit:"un",unitPrice:30,discount:0}],deadline:"20 dias",paymentTerms:"Cartão de crédito em 2 vezes",paymentDetails:{method:"credit_card",installments:2,display:"Cartão de crédito em 2 vezes"},validity:"2026-09-13",itemType:"product",totalPrice:600}});
describe("lifecycle canônico do Agent V1",()=>{
 it("vincula confirmação a taskId + revision e invalida botão antigo",()=>{const presented=presentTaskConfirmation(complete()),encoded=encodeBoundAction({actionId:"confirm_document",taskId:presented.id,revision:presented.revision}),action=decodeBoundAction(encoded)!;expect(validateBoundAction(presented,action).valid).toBe(true);expect(()=>confirmTask(presented,{taskId:presented.id,revision:presented.revision+1})).toThrow("TASK_CONFIRMATION_STALE");});
 it("executa create_quote uma vez e reutiliza resultado após retry/restart",async()=>{const presented=presentTaskConfirmation(complete()),executing=confirmTask(presented,{taskId:presented.id,revision:presented.revision}),create=vi.fn(async()=>({resultRef:"doc:1"})),first=await executeRegisteredTool(executing,{create_quote:create,create_purchase_order:vi.fn()});const second=await executeRegisteredTool(first.task,{create_quote:create,create_purchase_order:vi.fn()});expect(create).toHaveBeenCalledTimes(1);expect(first.task.status).toBe("completed");expect(second.executed).toBe(false);expect(second.resultRef).toBe("doc:1");});
 it("preserva pergunta e revisão durante interrupção e retomada",()=>{const task=complete(),interrupted=beginInterruption(task,"organization_tax_id"),resumed=completeInterruption(interrupted);expect(interrupted.id).toBe(task.id);expect(interrupted.revision).toBe(task.revision);expect(resumed.currentQuestion).toEqual(task.currentQuestion);expect(resumed.interruption).toBeNull();});
});
