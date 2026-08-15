import {describe,expect,it} from "vitest";
import {consumeConversationPrompt,createConversationPrompt,resolveActivePrompt} from "@/lib/navigation/conversation-prompts";

describe("prompt consumível",()=>{
  it("executa somente a opção visível, uma única vez e no estado esperado",()=>{
    const prompt=createConversationPrompt({promptType:"continuation",flowId:"error",expectedState:"menu",options:[{number:2,id:"talk_to_lume",label:"Falar com a Lume"}]});
    expect(resolveActivePrompt("2",prompt,"menu")?.id).toBe("talk_to_lume");
    expect(resolveActivePrompt("1",prompt,"menu")).toBeUndefined();
    expect(resolveActivePrompt("2",prompt,"collecting")).toBeUndefined();
    expect(resolveActivePrompt("2",consumeConversationPrompt(prompt),"menu")).toBeUndefined();
  });
});
