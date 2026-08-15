import { z } from "zod";
import type { TaskStateV1 } from "./task-state";
export const boundActionSchema=z.object({actionId:z.enum(["confirm_document","correct_document","cancel_document","resume_task","retry_pdf","retry_delivery","personalize_now","not_now","confirm_party","choose_other_party","include_cnpj","skip_cnpj","choose_party"]),taskId:z.uuid(),revision:z.number().int().nonnegative(),entityId:z.uuid().optional()});
export type BoundAction=z.infer<typeof boundActionSchema>;
export function encodeBoundAction(action:BoundAction){return `v1:${action.actionId}:${action.taskId}:${action.revision}${action.entityId?`:${action.entityId}`:""}`;}
export function decodeBoundAction(value:string){const match=/^v1:([a-z_]+):([0-9a-f-]{36}):(\d+)(?::([0-9a-f-]{36}))?$/i.exec(value);return match?boundActionSchema.safeParse({actionId:match[1],taskId:match[2],revision:Number(match[3]),entityId:match[4]}).data:undefined;}
export function validateBoundAction(task:TaskStateV1,action:BoundAction){return task.id===action.taskId&&task.revision===action.revision?{valid:true as const}:{valid:false as const,reply:"Essa opção pertence a uma versão anterior da tarefa. Vou considerar os dados mais recentes."};}
