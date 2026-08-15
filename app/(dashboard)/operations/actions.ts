"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
import {
  acceptOperationalReport,
  completeChecklist,
  createOperationalDocument,
  transitionOperationalDocument,
  updateChecklistItem,
} from "@/lib/operations/service";
import { storeOperationalAttachment } from "@/lib/operations/attachments";
import { confirmQuoteConversion } from "@/lib/operations/conversion";
const value = (form: FormData, key: string) =>
  String(form.get(key) ?? "").trim();
async function context() {
  const { supabase, organizationId, user, role } = await requireMembership();
  return { supabase, organizationId, userId: user.id, role };
}
export async function createOrderFromQuote(form:FormData){const ctx=await context(),created=await confirmQuoteConversion(ctx,value(form,"quote_id"),{title:value(form,"title"),location:value(form,"location"),responsibleId:value(form,"responsible_id"),scheduledAt:value(form,"scheduled_at")?new Date(value(form,"scheduled_at")).toISOString():undefined,dueAt:value(form,"due_at")?new Date(value(form,"due_at")).toISOString():undefined,priority:(value(form,"priority")||"normal")as"low"|"normal"|"high"|"urgent"});redirect(`/operations/${created.id}`)}
export async function createOperation(form: FormData) {
  const ctx = await context(),
    type = value(form, "type"),
    requestId = value(form, "request_id");
  let input: unknown;
  if (type === "service_order")
    input = {
      type,
      title: value(form, "title"),
      description: value(form, "description"),
      counterpartyId: value(form, "counterparty_id"),
      location: value(form, "location"),
      responsibleId: value(form, "responsible_id"),
      scheduledAt: value(form, "scheduled_at")
        ? new Date(value(form, "scheduled_at")).toISOString()
        : undefined,
      dueAt: value(form, "due_at")
        ? new Date(value(form, "due_at")).toISOString()
        : undefined,
      priority: value(form, "priority") || "normal",
      materials: value(form, "materials")
        .split("\n")
        .map((v) => v.trim())
        .filter(Boolean),
      notes: value(form, "notes") || undefined,
      requestId,
    };
  else if (type === "checklist") {
    let items = value(form, "items")
      .split("\n")
      .map((v) => v.trim())
      .filter(Boolean)
      .map((title) => ({ title, required: true }));
    const templateId = value(form, "template_id");
    if (!items.length && templateId) {
      const template = await ctx.supabase
        .from("checklist_templates")
        .select("items_snapshot")
        .eq("organization_id", ctx.organizationId)
        .eq("id", templateId)
        .eq("active", true)
        .is("deleted_at", null)
        .single();
      items = (
        (template.data?.items_snapshot ?? []) as Array<{
          title: string;
          required?: boolean;
        }>
      ).map((item) => ({ title: item.title, required: item.required ?? true }));
    }
    input = {
      type,
      title: value(form, "title"),
      description: value(form, "description") || undefined,
      counterpartyId: value(form, "counterparty_id") || undefined,
      location: value(form, "location") || undefined,
      responsibleId: value(form, "responsible_id"),
      serviceOrderId: value(form, "service_order_id") || undefined,
      items,
      requestId,
    };
  } else
    input = {
      type: "service_report",
      modality: value(form, "modality"),
      title: value(form, "title"),
      counterpartyId: value(form, "counterparty_id"),
      location: value(form, "location"),
      responsibleId: value(form, "responsible_id"),
      serviceOrderId: value(form, "service_order_id") || undefined,
      checklistId: value(form, "checklist_id") || undefined,
      objective: value(form, "objective"),
      findings: value(form, "findings"),
      activities: value(form, "activities") || undefined,
      materials: value(form, "materials") || undefined,
      nonConformities: value(form, "non_conformities") || undefined,
      recommendations: value(form, "recommendations") || undefined,
      conclusion: value(form, "conclusion"),
      requestId,
    };
  const created = await createOperationalDocument(ctx, input);
  revalidatePath("/operations");
  redirect(`/operations/${created.id}`);
}
export async function transitionOperation(form: FormData) {
  const ctx = await context(),
    id = value(form, "id");
  await transitionOperationalDocument(ctx, {
    id,
    to: value(form, "to"),
    observation: value(form, "observation") || undefined,
    overrideReason: value(form, "override_reason") || undefined,
    completedAt:
      value(form, "to") === "completed" ? new Date().toISOString() : undefined,
    explicitConfirmation: value(form, "confirm") === "yes",
  });
  revalidatePath(`/operations/${id}`);
}
export async function saveChecklistItem(form: FormData) {
  const ctx = await context(),
    checklistId = value(form, "checklist_id");
  await updateChecklistItem(ctx, {
    checklistId,
    itemId: value(form, "item_id"),
    status: value(form, "status"),
    notes: value(form, "notes") || undefined,
    nonComplianceReason: value(form, "non_compliance_reason") || undefined,
    correctiveAction: value(form, "corrective_action") || undefined,
  });
  revalidatePath(`/operations/${checklistId}`);
}
export async function finishChecklist(form: FormData) {
  const ctx = await context(),
    id = value(form, "id");
  await completeChecklist(ctx, id, value(form, "confirm") === "yes");
  revalidatePath(`/operations/${id}`);
}
export async function acceptReport(form: FormData) {
  const ctx = await context(),
    id = value(form, "id");
  await acceptOperationalReport(ctx, {
    id,
    name: value(form, "name"),
    role: value(form, "acceptance_role"),
    channel: "panel",
    observation: value(form, "observation") || undefined,
    explicitConfirmation: value(form, "confirm") === "yes",
  });
  revalidatePath(`/operations/${id}`);
}
export async function saveChecklistTemplate(form: FormData) {
  const ctx = await context(),
    name = value(form, "name"),
    items = value(form, "items")
      .split("\n")
      .map((title) => title.trim())
      .filter(Boolean)
      .map((title, index) => ({ position: index + 1, title, required: true }));
  if (name.length < 3 || !items.length)
    throw new Error("CHECKLIST_TEMPLATE_INVALID");
  const latest = await ctx.supabase
    .from("checklist_templates")
    .select("version")
    .eq("organization_id", ctx.organizationId)
    .eq("name", name)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = (latest.data?.version ?? 0) + 1;
  const { error } = await ctx.supabase.from("checklist_templates").insert({
    organization_id: ctx.organizationId,
    name,
    version,
    items_snapshot: items,
    created_by: ctx.userId,
  });
  if (error) throw new Error("CHECKLIST_TEMPLATE_CREATE_FAILED");
  await ctx.supabase.from("audit_logs").insert({
    organization_id: ctx.organizationId,
    actor_id: ctx.userId,
    action: "operations.checklist_template.created",
    entity_type: "checklist_template",
    metadata: { name, version, itemCount: items.length },
  });
  revalidatePath("/operations/templates");
}
export async function uploadOperationalEvidence(form: FormData) {
  const ctx = await context(),
    documentId = value(form, "document_id"),
    file = form.get("file");
  if (!(file instanceof File)) throw new Error("ATTACHMENT_REQUIRED");
  await storeOperationalAttachment(ctx, {
    documentId,
    itemId: value(form, "item_id") || undefined,
    file,
    caption: value(form, "caption") || undefined,
    evidenceKind: value(form, "evidence_kind") || "document",
  });
  revalidatePath(`/operations/${documentId}`);
}
