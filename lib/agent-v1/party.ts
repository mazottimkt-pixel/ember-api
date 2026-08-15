import { z } from "zod";
import {
  currentQuestionSchema,
  taskStateV1Schema,
  type TaskStateV1,
} from "./task-state";

export const partyCandidateSchema = z.object({
  contactId: z.uuid(),
  name: z.string().trim().min(2).max(160),
  documentNumber: z.string().trim().max(20).optional(),
});
export type PartyCandidate = z.infer<typeof partyCandidateSchema>;
const nowIso = (now: Date) => now.toISOString();
export function applyPartyCandidates(
  task: TaskStateV1,
  candidates: PartyCandidate[],
  now = new Date(),
): TaskStateV1 {
  const role =
      task.type === "purchase_order"
        ? ("supplier" as const)
        : ("client" as const),
    revision = task.revision + 1,
    timestamp = nowIso(now);
  if (candidates.length === 1) {
    const party = {
      role,
      source: "registered" as const,
      contactId: candidates[0].contactId,
      name: candidates[0].name,
      documentNumber: candidates[0].documentNumber,
      confirmed: true,
    };
    return taskStateV1Schema.parse({
      ...task,
      party,
      collectedData: { ...task.collectedData, counterpartyName: party.name },
      revision,
      currentQuestion: null,
      timestamps: { ...task.timestamps, updatedAt: timestamp },
    });
  }
  if (candidates.length > 1) {
    return taskStateV1Schema.parse({
      ...task,
      ambiguities: [
        ...task.ambiguities.filter((a) => !a.startsWith("party_candidates:")),
        `party_candidates:${JSON.stringify(candidates)}`,
      ],
      revision,
      currentQuestion: currentQuestionSchema.parse({
        type: "choose_party",
        promptId: `${task.id}:choose_party:${revision}`,
        taskId: task.id,
        revision,
        allowedActions: ["choose_party", "choose_other_party"],
        askedAt: timestamp,
      }),
      timestamps: { ...task.timestamps, updatedAt: timestamp },
    });
  }
  const party = {
    role,
    source: "ad_hoc" as const,
    name: task.collectedData.counterpartyName!,
    confirmed: true,
  };
  return taskStateV1Schema.parse({
    ...task,
    party,
    revision,
    currentQuestion: currentQuestionSchema.parse({
      type: "party_cnpj",
      promptId: `${task.id}:party_cnpj:${revision}`,
      taskId: task.id,
      revision,
      allowedActions: ["include_cnpj", "skip_cnpj"],
      askedAt: timestamp,
    }),
    timestamps: { ...task.timestamps, updatedAt: timestamp },
  });
}
export function chooseParty(
  task: TaskStateV1,
  contactId: string,
  now = new Date(),
): TaskStateV1 {
  const raw = task.ambiguities.find((a) => a.startsWith("party_candidates:"));
  if (!raw) throw new Error("PARTY_OPTIONS_MISSING");
  const candidates = z
      .array(partyCandidateSchema)
      .parse(JSON.parse(raw.slice("party_candidates:".length))),
    candidate = candidates.find((item) => item.contactId === contactId);
  if (!candidate) throw new Error("PARTY_OPTION_STALE");
  return applyPartyCandidates(
    { ...task, ambiguities: task.ambiguities.filter((a) => a !== raw) },
    [candidate],
    now,
  );
}
export function completePartyTaxId(
  task: TaskStateV1,
  documentNumber?: string,
  now = new Date(),
): TaskStateV1 {
  if (!task.party) throw new Error("PARTY_NOT_RESOLVED");
  const revision = task.revision + 1,
    timestamp = now.toISOString();
  return taskStateV1Schema.parse({
    ...task,
    party: { ...task.party, documentNumber, confirmed: true },
    revision,
    currentQuestion: null,
    timestamps: { ...task.timestamps, updatedAt: timestamp },
  });
}
