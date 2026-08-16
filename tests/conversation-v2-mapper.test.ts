import {describe,expect,it} from "vitest";
import {emptyAgentDraft} from "@/lib/ai/contracts";
import {mapLegacyConversationToV2} from "@/lib/conversation-v2/legacy-mapper";

const base={organizationId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",conversationKey:"wa:1",state:"collecting",now:"2026-08-16T12:00:00.000Z"};
const draft={...emptyAgentDraft(),type:"quote" as const,counterpartyName:"Alfa",items:[{description:"Lâmpadas",quantity:20,unit:"un",unitPrice:30,discount:0}],itemType:"product" as const};
describe("legacy → V2 mapper",()=>{
  it("maps a coherent context without inventing parallel material fields",()=>{const mapped=mapLegacyConversationToV2({...base,context:{draft,collection:{pendingField:"prazo",expectedAnswer:"delivery_deadline"}}});expect(mapped.classification).toBe("MIGRATABLE");expect(mapped.state?.draft).not.toHaveProperty("quotedItemDescription");expect(mapped.state?.interaction?.expectedInput).toBe("delivery_deadline");});
  it.each([
    ["pendingField != expectedAnswer",{draft,collection:{pendingField:"prazo",expectedAnswer:"payment_terms"}},"LEGACY_INTERACTION_CONFLICT"],
    ["expectedAnswer != activePrompt",{draft,collection:{expectedAnswer:"payment_terms",activePrompt:{promptType:"confirmation"}}},"LEGACY_INTERACTION_CONFLICT"],
    ["draft.party != collection.party",{draft,collection:{party:{name:"Beta",source:"ad_hoc"}}},"LEGACY_PARTY_CONFLICT"],
    ["draft.items != hybrid.entities",{draft,collection:{hybrid:{recentEntities:{service:{value:"Cadeiras"}}}}},"LEGACY_ITEMS_HYBRID_CONFLICT"],
    ["summary != draft",{draft,collection:{summary:{draft:{...draft,deadline:"99 dias"}}}},"LEGACY_SUMMARY_DRAFT_CONFLICT"],
  ] as const)("detects %s",(_name,context,code)=>{const mapped=mapLegacyConversationToV2({...base,context});expect(mapped.classification).toBe("CONFLICTING");expect(mapped.conflicts).toContain(code);});
  it("detects documentId incompatible with document status",()=>{const mapped=mapLegacyConversationToV2({...base,context:{draft,documentId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd"},documentStatus:"missing"});expect(mapped.conflicts).toContain("LEGACY_DOCUMENT_STATUS_CONFLICT");});
  it("classifies stale and fatal contexts without silently repairing them",()=>{expect(mapLegacyConversationToV2({...base,updatedAt:"2026-08-01T00:00:00.000Z",context:{draft}}).classification).toBe("STALE");expect(mapLegacyConversationToV2({...base,context:{draft:{type:"invalid"}}}).classification).toBe("CORRUPTED_FATAL");});
});
