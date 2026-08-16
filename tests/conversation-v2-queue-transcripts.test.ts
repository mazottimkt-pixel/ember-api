import {describe,expect,it} from "vitest";
import {createConversationStateV2} from "@/lib/conversation-v2/schema";
import {ConversationQueueEngineV2,nextCursorState} from "@/lib/conversation-v2/queue-engine";
import {MemoryConversationQueueStoreV2} from "@/lib/conversation-v2/memory-queue-store";

const org="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",now="2026-08-16T12:00:10.000Z",receivedBase=Date.parse(now)-1_000;
const transcripts=[
  ["20 cadeiras","pretas","na verdade 30"],
  ["orçamento para Alfa de 20 lâmpadas","09557452000143","confirmo"],
  ["quero fazer um orçamento","qual foi meu último pedido?","podemos continuar"],
  ["quero um orçamento","na verdade faça um pedido de compra"],
  ["não, obrigado","preciso de um orçamento novo"],
];
describe("Phase 5 real transcript ordering",()=>{
  it.each(transcripts)("preserves rapid transcript order",async(...messages)=>{const key=`wa:${messages[0]}`,state=createConversationStateV2({organizationId:org,conversationKey:key,now}),store=new MemoryConversationQueueStoreV2([state]),engine=new ConversationQueueEngineV2(store,{graceMs:0,clock:()=>new Date(now),ownerToken:()=>"worker"}),seen:string[]=[];for(const[index,text]of messages.entries())await engine.enqueue({id:`${index}-${key}`,organizationId:org,conversationKey:key,externalMessageId:`wamid.${index}`,receivedAt:new Date(receivedBase+index).toISOString(),payload:{text}});await engine.drainAvailable((current,job)=>{seen.push((job.payload as {text:string}).text);return nextCursorState(current,job,now);});expect(seen).toEqual(messages);expect(store.states.get(key)?.revision).toBe(messages.length);});
});
