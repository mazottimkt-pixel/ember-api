import { createHash } from "node:crypto";
import { z } from "zod";
export const operationalTypes = [
  "service_order",
  "checklist",
  "service_report",
] as const;
export const priorities = ["low", "normal", "high", "urgent"] as const;
export const serviceOrderStates = [
  "draft",
  "pending_approval",
  "approved",
  "scheduled",
  "in_progress",
  "paused",
  "completed",
  "cancelled",
  "rejected",
] as const;
export const checklistStates = [
  "draft",
  "in_progress",
  "completed",
  "completed_with_issues",
  "cancelled",
] as const;
export const checklistItemStates = [
  "pending",
  "completed",
  "not_applicable",
  "non_compliant",
  "blocked",
] as const;
export const reportStates = [
  "draft",
  "under_review",
  "ready_for_acceptance",
  "accepted",
  "completed",
  "cancelled",
] as const;
export const serviceOrderTransitions: Record<string, readonly string[]> = {
  draft: ["pending_approval", "cancelled"],
  pending_approval: ["approved", "rejected", "cancelled"],
  approved: ["scheduled", "cancelled"],
  scheduled: ["in_progress", "cancelled"],
  in_progress: ["paused", "completed", "cancelled"],
  paused: ["in_progress", "cancelled"],
  completed: [],
  cancelled: [],
  rejected: [],
};
export const checklistTransitions: Record<string, readonly string[]> = {
  draft: ["in_progress", "cancelled"],
  in_progress: ["completed", "completed_with_issues", "cancelled"],
  completed: [],
  completed_with_issues: [],
  cancelled: [],
};
export const reportTransitions: Record<string, readonly string[]> = {
  draft: ["under_review", "cancelled"],
  under_review: ["ready_for_acceptance", "draft", "cancelled"],
  ready_for_acceptance: ["accepted", "under_review", "cancelled"],
  accepted: ["completed"],
  completed: [],
  cancelled: [],
};
export const serviceOrderInputSchema = z.object({
  type: z.literal("service_order"),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(3).max(4000),
  counterpartyId: z.uuid(),
  location: z.string().trim().min(3).max(500),
  responsibleId: z.uuid(),
  scheduledAt: z.iso.datetime().optional(),
  dueAt: z.iso.datetime().optional(),
  priority: z.enum(priorities).default("normal"),
  notes: z.string().trim().max(3000).optional(),
  sourceDocumentId: z.uuid().optional(),
  materials: z.array(z.string().trim().min(1).max(300)).max(100).default([]),
  requestId: z.uuid(),
});
export const checklistItemInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(1000).optional(),
  required: z.boolean().default(true),
});
export const checklistInputSchema = z.object({
  type: z.literal("checklist"),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(2000).optional(),
  counterpartyId: z.uuid().optional(),
  location: z.string().trim().max(500).optional(),
  responsibleId: z.uuid(),
  serviceOrderId: z.uuid().optional(),
  items: z.array(checklistItemInputSchema).min(1).max(200),
  requestId: z.uuid(),
});
export const serviceReportInputSchema = z.object({
  type: z.literal("service_report"),
  modality: z.enum(["service", "inspection"]),
  title: z.string().trim().min(3).max(160),
  counterpartyId: z.uuid(),
  location: z.string().trim().min(3).max(500),
  responsibleId: z.uuid(),
  serviceOrderId: z.uuid().optional(),
  checklistId: z.uuid().optional(),
  objective: z.string().trim().min(3).max(3000),
  findings: z.string().trim().min(3).max(5000),
  activities: z.string().trim().max(5000).optional(),
  materials: z.string().trim().max(3000).optional(),
  nonConformities: z.string().trim().max(3000).optional(),
  recommendations: z.string().trim().max(3000).optional(),
  conclusion: z.string().trim().min(3).max(5000),
  requestId: z.uuid(),
});
export function assertTransition(
  type: (typeof operationalTypes)[number],
  from: string,
  to: string,
) {
  const map =
    type === "service_order"
      ? serviceOrderTransitions
      : type === "checklist"
        ? checklistTransitions
        : reportTransitions;
  if (!map[from]?.includes(to))
    throw new Error("INVALID_OPERATIONAL_TRANSITION");
}
export function resolveChecklistCompletion(
  items: Array<{ required: boolean; status: string; notes?: string | null }>,
) {
  if (
    items.some((i) => i.required && ["pending", "blocked"].includes(i.status))
  )
    throw new Error("REQUIRED_CHECKLIST_ITEM_PENDING");
  if (
    items.some(
      (i) => i.required && i.status === "not_applicable" && !i.notes?.trim(),
    )
  )
    throw new Error("REQUIRED_NOT_APPLICABLE_REASON");
  return items.some((i) => i.status === "non_compliant")
    ? "completed_with_issues"
    : "completed";
}
export function assertServiceOrderCompletion(input: {
  responsibleId?: string | null;
  completedAt?: string | null;
  checklistStatus?: string | null;
  overrideReason?: string | null;
  canOverride?: boolean;
}) {
  if (!input.responsibleId) throw new Error("RESPONSIBLE_REQUIRED");
  if (!input.completedAt) throw new Error("COMPLETION_DATE_REQUIRED");
  if (
    input.checklistStatus &&
    !["completed", "completed_with_issues"].includes(input.checklistStatus) &&
    !(input.canOverride && input.overrideReason?.trim())
  )
    throw new Error("CHECKLIST_BLOCKS_COMPLETION");
}
export function contentFingerprint(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export function validateAttachment(input: {
  name: string;
  mimeType: string;
  size: number;
  bytes?: Uint8Array;
}) {
  const allowed: Record<string, readonly string[]> = {
    "image/png": [".png"],
    "image/jpeg": [".jpg", ".jpeg"],
    "image/webp": [".webp"],
    "application/pdf": [".pdf"],
  };
  if (!Number.isSafeInteger(input.size) || input.size < 1)
    throw new Error("EMPTY_ATTACHMENT");
  if (input.size > 10 * 1024 * 1024) throw new Error("ATTACHMENT_TOO_LARGE");
  const extensions = allowed[input.mimeType];
  if (
    !extensions ||
    !extensions.some((ext) => input.name.toLowerCase().endsWith(ext))
  )
    throw new Error("INVALID_ATTACHMENT_TYPE");
  if (input.bytes) {
    const b = input.bytes;
    const valid =
      input.mimeType === "image/png"
        ? b[0] === 0x89 && b[1] === 0x50
        : input.mimeType === "image/jpeg"
          ? b[0] === 0xff && b[1] === 0xd8
          : input.mimeType === "image/webp"
            ? String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
              String.fromCharCode(...b.slice(8, 12)) === "WEBP"
            : String.fromCharCode(...b.slice(0, 4)) === "%PDF";
    if (!valid) throw new Error("CORRUPT_ATTACHMENT");
  }
  return true;
}
export function operationalNumberPrefix(
  type: string,
  modality?: string | null,
) {
  return type === "service_order"
    ? "OS"
    : type === "checklist"
      ? "CHK"
      : modality === "inspection"
        ? "VIS"
        : "REL";
}
