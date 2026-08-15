"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
import {
  generateContentImage,
  generateContentProject,
  saveBrandProfile,
  duplicateContentProject,
  createContentVersion,
} from "@/lib/content/service";
import { OpenAIContentProvider } from "@/lib/content/provider";
const v = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
async function ctx() {
  const { supabase, organizationId, user } = await requireMembership();
  return { supabase, organizationId, userId: user.id };
}
export async function duplicateContent(form:FormData){const context=await ctx(),result=await duplicateContentProject(context,v(form,"id"),v(form,"request_id"));redirect(`/content/${result.id}`)}
export async function newContentVersion(form:FormData){const context=await ctx(),result=await createContentVersion(context,v(form,"id"),v(form,"request_id"));redirect(`/content/${result.id}`)}
export async function restoreContent(form:FormData){const context=await ctx(),id=v(form,"id");await context.supabase.from("content_projects").update({status:"draft"}).eq("organization_id",context.organizationId).eq("id",id).eq("status","archived");revalidatePath(`/content/${id}`)}
export async function saveContentBrand(form: FormData) {
  await saveBrandProfile(await ctx(), {
    segment: v(form, "segment"),
    audience: v(form, "audience"),
    voiceTone: v(form, "voice_tone"),
    defaultCta: v(form, "default_cta") || undefined,
    colors: v(form, "colors")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    visualStyle: v(form, "visual_style") || undefined,
    primaryGoal: v(form, "primary_goal") || undefined,
    networks: v(form, "networks")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    preferredWords: [],
    forbiddenWords: [],
    notes: v(form, "notes") || undefined,
  });
  revalidatePath("/content/brand");
}
export async function createContent(form: FormData) {
  const context = await ctx(),
    requestId = v(form, "request_id");
  const result = await generateContentProject(
    context,
    new OpenAIContentProvider(),
    {
      type: v(form, "type"),
      objective: v(form, "objective"),
      subject: v(form, "subject"),
      audience: v(form, "audience"),
      tone: v(form, "tone"),
      offer: v(form, "offer") || undefined,
      price: v(form, "price") || undefined,
      deadline: v(form, "deadline") || undefined,
      length: v(form, "length") || undefined,
      duration: v(form, "duration") || undefined,
      storyCount: v(form, "story_count") || undefined,
      calendarDays: v(form, "calendar_days") || undefined,
      requestId,
    },
  );
  redirect(`/content/${result?.id}`);
}
export async function approveContent(form: FormData) {
  const context = await ctx(),
    id = v(form, "id");
  await context.supabase
    .from("content_projects")
    .update({
      status: "approved",
      approved_by: context.userId,
      approved_at: new Date().toISOString(),
    })
    .eq("organization_id", context.organizationId)
    .eq("id", id)
    .eq("status", "ready_for_review");
  revalidatePath(`/content/${id}`);
}
export async function archiveContent(form: FormData) {
  const context = await ctx(),
    id = v(form, "id");
  await context.supabase
    .from("content_projects")
    .update({ status: "archived" })
    .eq("organization_id", context.organizationId)
    .eq("id", id);
  revalidatePath(`/content/${id}`);
}
export async function createContentImage(form: FormData) {
  if (v(form, "confirm_cost") !== "yes")
    throw new Error("IMAGE_EXPLICIT_CONFIRMATION_REQUIRED");
  const context = await ctx(),
    projectId = v(form, "project_id");
  await generateContentImage(context, new OpenAIContentProvider(), projectId, {
    objective: v(form, "objective"),
    subject: v(form, "subject"),
    format: v(form, "format"),
    style: v(form, "style"),
    colors: v(form, "colors")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    shortTitle: v(form, "short_title") || undefined,
    subtitle: v(form, "subtitle") || undefined,
    cta: v(form, "cta") || undefined,
    audience: v(form, "audience"),
    restrictions: v(form, "restrictions") || undefined,
    requestId: v(form, "request_id"),
  });
  revalidatePath(`/content/${projectId}`);
}
