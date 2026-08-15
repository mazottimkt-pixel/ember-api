import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  assertServiceOrderCompletion,
  assertTransition,
  checklistInputSchema,
  contentFingerprint,
  resolveChecklistCompletion,
  serviceOrderInputSchema,
  serviceReportInputSchema,
} from "./domain";

export type OperationalContext = {
  supabase: SupabaseClient;
  organizationId: string;
  userId: string;
  role: string;
};
const canWrite = (role: string) => ["owner", "admin", "sales"].includes(role);
export const operationalPermissions = {
  owner: "manager",
  admin: "manager",
  sales: "operator",
  viewer: "viewer",
} as const;
function authorize(ctx: OperationalContext) {
  if (!canWrite(ctx.role)) throw new Error("OPERATION_FORBIDDEN");
}
async function reserve(ctx: OperationalContext, type: string) {
  const { data, error } = await ctx.supabase.rpc("next_operational_number", {
    org_id: ctx.organizationId,
    operation_type: type,
  });
  if (error || !data) throw new Error("OPERATIONAL_NUMBER_FAILED");
  return String(data);
}
async function existing(ctx: OperationalContext, requestId: string) {
  return (
    await ctx.supabase
      .from("operational_documents")
      .select("id,number,type,status")
      .eq("organization_id", ctx.organizationId)
      .eq("request_id", requestId)
      .maybeSingle()
  ).data;
}
async function contactSnapshot(ctx: OperationalContext, id?: string) {
  if (!id) return {};
  const { data } = await ctx.supabase
    .from("business_contacts")
    .select("id,legal_name,trade_name,tax_id,phone,email")
    .eq("organization_id", ctx.organizationId)
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (!data) throw new Error("OPERATIONAL_CONTACT_NOT_FOUND");
  return { name: data.legal_name, ...data };
}
async function event(
  ctx: OperationalContext,
  id: string,
  eventType: string,
  extra: Record<string, unknown> = {},
) {
  await ctx.supabase.from("operational_events").insert({
    organization_id: ctx.organizationId,
    operational_document_id: id,
    actor_id: ctx.userId,
    event_type: eventType,
    ...extra,
  });
  await ctx.supabase.from("audit_logs").insert({
    organization_id: ctx.organizationId,
    actor_id: ctx.userId,
    action: `operations.${eventType}`,
    entity_type: "operational_document",
    entity_id: id,
    metadata: extra,
  });
}

export async function createOperationalDocument(
  ctx: OperationalContext,
  input: unknown,
) {
  authorize(ctx);
  const base = z
    .object({
      type: z.enum(["service_order", "checklist", "service_report"]),
      requestId: z.uuid(),
    })
    .parse(input);
  const found = await existing(ctx, base.requestId);
  if (found) return found;
  if (base.type === "service_order") {
    const d = serviceOrderInputSchema.parse(input),
      party = await contactSnapshot(ctx, d.counterpartyId),
      number = await reserve(ctx, "service_order");
    const { data, error } = await ctx.supabase
      .from("operational_documents")
      .insert({
        organization_id: ctx.organizationId,
        type: d.type,
        number,
        request_id: d.requestId,
        status: "draft",
        priority: d.priority,
        title: d.title,
        description: d.description,
        counterparty_id: d.counterpartyId,
        counterparty_snapshot: party,
        location_snapshot: { label: d.location },
        responsible_id: d.responsibleId,
        scheduled_at: d.scheduledAt,
        due_at: d.dueAt,
        source_document_id: d.sourceDocumentId,
        content: { materials: d.materials, notes: d.notes },
        content_fingerprint: contentFingerprint(d),
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
      .select("id,number,type,status")
      .single();
    if (error || !data)
      throw new Error(
        error?.code === "23505"
          ? "OPERATION_DUPLICATE"
          : "SERVICE_ORDER_CREATE_FAILED",
      );
    await event(ctx, data.id, "created");
    return data;
  }
  if (base.type === "checklist") {
    const d = checklistInputSchema.parse(input),
      party = await contactSnapshot(ctx, d.counterpartyId),
      number = await reserve(ctx, "checklist");
    const { data, error } = await ctx.supabase
      .from("operational_documents")
      .insert({
        organization_id: ctx.organizationId,
        type: d.type,
        number,
        request_id: d.requestId,
        status: "draft",
        title: d.title,
        description: d.description,
        counterparty_id: d.counterpartyId,
        counterparty_snapshot: party,
        location_snapshot: { label: d.location },
        responsible_id: d.responsibleId,
        service_order_id: d.serviceOrderId,
        content_fingerprint: contentFingerprint(d),
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
      .select("id,number,type,status")
      .single();
    if (error || !data) throw new Error("CHECKLIST_CREATE_FAILED");
    const rows = d.items.map((item, index) => ({
      organization_id: ctx.organizationId,
      checklist_id: data.id,
      position: index + 1,
      title: item.title,
      description: item.description,
      required: item.required,
    }));
    if (
      (await ctx.supabase.from("operational_checklist_items").insert(rows))
        .error
    )
      throw new Error("CHECKLIST_ITEMS_CREATE_FAILED");
    await event(ctx, data.id, "created");
    return data;
  }
  const d = serviceReportInputSchema.parse(input),
    party = await contactSnapshot(ctx, d.counterpartyId),
    number = await reserve(
      ctx,
      d.modality === "inspection"
        ? "service_report_inspection"
        : "service_report_service",
    );
  const { data, error } = await ctx.supabase
    .from("operational_documents")
    .insert({
      organization_id: ctx.organizationId,
      type: d.type,
      modality: d.modality,
      number,
      request_id: d.requestId,
      status: "draft",
      title: d.title,
      counterparty_id: d.counterpartyId,
      counterparty_snapshot: party,
      location_snapshot: { label: d.location },
      responsible_id: d.responsibleId,
      service_order_id: d.serviceOrderId,
      checklist_id: d.checklistId,
      content: {
        objective: d.objective,
        findings: d.findings,
        activities: d.activities,
        materials: d.materials,
        nonConformities: d.nonConformities,
        recommendations: d.recommendations,
        conclusion: d.conclusion,
      },
      content_fingerprint: contentFingerprint(d),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id,number,type,status")
    .single();
  if (error || !data) throw new Error("SERVICE_REPORT_CREATE_FAILED");
  await event(ctx, data.id, "created");
  return data;
}

export async function transitionOperationalDocument(
  ctx: OperationalContext,
  input: {
    id: string;
    to: string;
    observation?: string;
    explicitConfirmation: boolean;
    completedAt?: string;
    overrideReason?: string;
  },
) {
  authorize(ctx);
  if (!input.explicitConfirmation)
    throw new Error("EXPLICIT_CONFIRMATION_REQUIRED");
  const id = z.uuid().parse(input.id);
  const { data: doc } = await ctx.supabase
    .from("operational_documents")
    .select("id,type,status,responsible_id,checklist_id,accepted_at")
    .eq("id", id)
    .eq("organization_id", ctx.organizationId)
    .is("deleted_at", null)
    .single();
  if (!doc) throw new Error("OPERATION_NOT_FOUND");
  if (
    ctx.role === "sales" &&
    (["approved", "cancelled", "rejected", "accepted"].includes(input.to) ||
      (input.to === "completed" && doc.type !== "checklist"))
  )
    throw new Error("MANAGER_PERMISSION_REQUIRED");
  assertTransition(doc.type, doc.status, input.to);
  if (doc.type === "service_order" && input.to === "completed") {
    let checklistStatus: string | null = null;
    if (doc.checklist_id) {
      const linked = await ctx.supabase
        .from("operational_documents")
        .select("status")
        .eq("organization_id", ctx.organizationId)
        .eq("id", doc.checklist_id)
        .single();
      checklistStatus = linked.data?.status ?? null;
    }
    assertServiceOrderCompletion({
      responsibleId: doc.responsible_id,
      completedAt: input.completedAt,
      checklistStatus,
      overrideReason: input.overrideReason,
      canOverride: ["owner", "admin"].includes(ctx.role),
    });
  }
  const updates: Record<string, unknown> = {
    status: input.to,
    updated_by: ctx.userId,
  };
  if (input.to === "in_progress" && !doc.status.includes("paused"))
    updates.started_at = new Date().toISOString();
  if (input.to === "completed")
    updates.completed_at = input.completedAt ?? new Date().toISOString();
  const { data, error } = await ctx.supabase
    .from("operational_documents")
    .update(updates)
    .eq("id", id)
    .eq("organization_id", ctx.organizationId)
    .eq("status", doc.status)
    .select("id,status")
    .single();
  if (error || !data) throw new Error("OPERATION_TRANSITION_CONFLICT");
  await event(ctx, id, "status.changed", {
    from_status: doc.status,
    to_status: input.to,
    observation: input.observation ?? input.overrideReason,
    source: "panel",
  });
  return data;
}

export async function updateChecklistItem(
  ctx: OperationalContext,
  input: {
    checklistId: string;
    itemId: string;
    status: string;
    notes?: string;
    nonComplianceReason?: string;
    correctiveAction?: string;
  },
) {
  authorize(ctx);
  const status = z
    .enum([
      "pending",
      "completed",
      "not_applicable",
      "non_compliant",
      "blocked",
    ])
    .parse(input.status);
  const { data, error } = await ctx.supabase
    .from("operational_checklist_items")
    .update({
      status,
      notes: input.notes,
      non_compliance_reason: input.nonComplianceReason,
      corrective_action: input.correctiveAction,
      responsible_id: ctx.userId,
      completed_at: status === "completed" ? new Date().toISOString() : null,
      updated_by: ctx.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", z.uuid().parse(input.itemId))
    .eq("checklist_id", z.uuid().parse(input.checklistId))
    .eq("organization_id", ctx.organizationId)
    .select("id")
    .single();
  if (error || !data) throw new Error("CHECKLIST_ITEM_UPDATE_FAILED");
  await event(ctx, input.checklistId, "checklist.item.updated", {
    metadata: { itemId: input.itemId, status },
  });
  return data;
}
export async function completeChecklist(
  ctx: OperationalContext,
  id: string,
  explicitConfirmation: boolean,
) {
  if (!explicitConfirmation) throw new Error("EXPLICIT_CONFIRMATION_REQUIRED");
  const { data: items } = await ctx.supabase
    .from("operational_checklist_items")
    .select("required,status,notes")
    .eq("organization_id", ctx.organizationId)
    .eq("checklist_id", z.uuid().parse(id));
  const status = resolveChecklistCompletion(items ?? []);
  return transitionOperationalDocument(ctx, {
    id,
    to: status,
    explicitConfirmation: true,
    completedAt: new Date().toISOString(),
  });
}
export async function acceptOperationalReport(
  ctx: OperationalContext,
  input: {
    id: string;
    name: string;
    role: string;
    channel: "panel" | "agent";
    observation?: string;
    explicitConfirmation: boolean;
  },
) {
  authorize(ctx);
  if (!["owner", "admin"].includes(ctx.role))
    throw new Error("MANAGER_PERMISSION_REQUIRED");
  if (!input.explicitConfirmation)
    throw new Error("EXPLICIT_CONFIRMATION_REQUIRED");
  const { data: doc } = await ctx.supabase
    .from("operational_documents")
    .select("id,status,content_fingerprint,version")
    .eq("organization_id", ctx.organizationId)
    .eq("id", z.uuid().parse(input.id))
    .eq("type", "service_report")
    .single();
  if (!doc || doc.status !== "ready_for_acceptance")
    throw new Error("REPORT_NOT_READY_FOR_ACCEPTANCE");
  const acceptedAt = new Date().toISOString(),
    acceptance = {
      name: z.string().trim().min(2).max(160).parse(input.name),
      role: z.string().trim().min(2).max(100).parse(input.role),
      channel: input.channel,
      observation: input.observation,
      acceptedAt,
      version: doc.version,
      fingerprint: doc.content_fingerprint,
    };
  const { error } = await ctx.supabase
    .from("operational_documents")
    .update({
      status: "accepted",
      acceptance,
      accepted_at: acceptedAt,
      accepted_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .eq("id", doc.id)
    .eq("organization_id", ctx.organizationId)
    .eq("status", "ready_for_acceptance");
  if (error) throw new Error("REPORT_ACCEPTANCE_FAILED");
  await event(ctx, doc.id, "accepted", {
    from_status: "ready_for_acceptance",
    to_status: "accepted",
    metadata: {
      channel: input.channel,
      version: doc.version,
      fingerprint: doc.content_fingerprint,
    },
  });
  return acceptance;
}
