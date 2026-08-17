import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { emptyAgentDraft } from "@/lib/ai/contracts";
import { CANONICAL_EXPECTED_INPUT_VALUES, LEGACY_EXPECTED_INPUT_MAPPING, normalizeExpectedInput } from "@/lib/conversation-v2/expected-input";
import { mapLegacyConversationToV2 } from "@/lib/conversation-v2/legacy-mapper";
import { classifyConversationalQuality } from "@/lib/conversation-v2/oracle";
import { SHADOW_OUTCOMES, shadowOutcomeForError } from "@/lib/conversation-v2/shadow-telemetry";
import { runConversationV2Shadow } from "@/lib/conversation-v2/shadow";

const org="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",now="2026-08-16T12:00:00.000Z";

describe("Conversation V2 Phase 5E gate",()=>{
  it("maps every known legacy value to exactly one canonical value",()=>{
    for(const [legacy,canonical] of Object.entries(LEGACY_EXPECTED_INPUT_MAPPING)){
      const result=normalizeExpectedInput(legacy,"expectedAnswer");
      expect(result).toMatchObject({status:"canonical",value:canonical});
      expect(CANONICAL_EXPECTED_INPUT_VALUES).toContain(canonical);
    }
  });

  it("audits unsupported expectedInput and preserves a recoverable V2 trajectory",()=>{
    const mapped=mapLegacyConversationToV2({organizationId:org,conversationKey:`${org}:wa:test`,state:"collecting",now,context:{draft:{...emptyAgentDraft(),type:"quote"},collection:{expectedAnswer:"future_legitimate_field"}}});
    expect(mapped.classification).toBe("CORRUPTED_RECOVERABLE");
    expect(mapped.issues).toContain("EXPECTED_INPUT_UNSUPPORTED:expectedAnswer:future_legitimate_field");
    expect(mapped.expectedInputAudit[0]).toMatchObject({status:"unsupported",origin:"expectedAnswer"});
    expect(mapped.state?.interaction?.expectedInput).toBe("free_text");
  });

  it.each([
    ["schema invalid","V2_SCHEMA_INVALID"],["expected input invalid","EXPECTED_INPUT_UNSUPPORTED"],
    ["mapper conflict","V2_MAPPING_CONFLICT"],["unsupported interaction","V2_INTERACTION_UNSUPPORTED"],
    ["bootstrap problem","V2_SHADOW_BOOTSTRAP_FAILED"],["state load problem","V2_SHADOW_STATE_LOAD_FAILED"],
  ])("accounts for pre-reducer failure: %s",(_label,code)=>{
    const outcome=shadowOutcomeForError(new Error(code));
    expect(SHADOW_OUTCOMES).toContain(outcome.outcome);
    expect(outcome.code).toBe(code);
  });

  it("does not grant conversational PASS from structural agreement",()=>{
    expect(classifyConversationalQuality({userMessage:"Preciso de 20 cadeiras",visibleReply:"Qual é o prazo?",stateBefore:"collecting",stateAfter:"collecting"}).category).toBe("CQ_NEEDS_HUMAN_REVIEW");
  });

  it("detects deterministic repeated questions and contextual refusal failures",()=>{
    expect(classifyConversationalQuality({userMessage:"Alfa",visibleReply:"Qual é o cliente?",stateBefore:"collecting",stateAfter:"collecting",expectedInputBefore:"counterparty",expectedInputAfter:"counterparty"}).category).toBe("CQ_REPEATED_QUESTION");
    expect(classifyConversationalQuality({userMessage:"Não, obrigado",visibleReply:"Qual é o item?",stateBefore:"collecting",stateAfter:"collecting"}).category).toBe("CQ_WRONG_CONTEXT");
  });

  it("persists a complete sanitized conversational evidence envelope",()=>{
    const audit=runConversationV2Shadow({organizationId:org,conversationKey:`${org}:wa:5511999999999`,legacyState:"collecting",legacyContext:{draft:{...emptyAgentDraft(),type:"quote"},collection:{expectedAnswer:"counterparty"}},inbound:{text:"Cliente 12345678000199, contato teste@example.com",externalMessageId:"wamid.secret-tail",receivedAt:now},legacyResult:{state:"collecting",reply:"Recebi 12345678000199. Qual é o item?",draft:{type:"quote"},collection:{activeTask:{type:"quote",nextAction:"itens"},expectedAnswer:"item_bundle"}}});
    expect(audit.evidence).toMatchObject({maskedEventId:"…ret-tail",taskType:"quote",legacyStateBefore:"collecting",legacyStateAfter:"collecting",v2NextAction:expect.any(String),structuralClassification:expect.any(String),conversationalClassification:expect.any(String)});
    const serialized=JSON.stringify(audit.evidence);
    expect(serialized).toContain("<ID>");
    expect(serialized).toContain("<EMAIL>");
    expect(serialized).not.toContain("12345678000199");
    expect(serialized).not.toContain("teste@example.com");
  });
});
