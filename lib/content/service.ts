import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  brandProfileSchema,
  briefingHash,
  contentBriefingSchema,
  imageBriefingSchema,
} from "./domain";
import type { ContentProvider } from "./provider";
type Ctx = { supabase: SupabaseClient; organizationId: string; userId: string };
export async function saveBrandProfile(ctx: Ctx, raw: unknown) {
  const d = brandProfileSchema.parse(raw),
    row = {
      organization_id: ctx.organizationId,
      segment: d.segment,
      audience: d.audience,
      voice_tone: d.voiceTone,
      preferred_words: d.preferredWords,
      forbidden_words: d.forbiddenWords,
      default_cta: d.defaultCta,
      colors: d.colors,
      visual_style: d.visualStyle,
      primary_goal: d.primaryGoal,
      networks: d.networks,
      notes: d.notes,
      updated_by: ctx.userId,
      created_by: ctx.userId,
    };
  const { data, error } = await ctx.supabase
    .from("content_brand_profiles")
    .upsert(row, { onConflict: "organization_id" })
    .select("id")
    .single();
  if (error || !data) throw new Error("BRAND_PROFILE_SAVE_FAILED");
  return data;
}
export async function generateContentProject(
  ctx: Ctx,
  provider: ContentProvider,
  raw: unknown,
) {
  const briefing = contentBriefingSchema.parse(raw);
  const existing = await ctx.supabase
    .from("content_projects")
    .select("id,status,text_content")
    .eq("organization_id", ctx.organizationId)
    .eq("request_id", briefing.requestId)
    .maybeSingle();
  if (existing.data) return existing.data;
  const brand = await ctx.supabase
    .from("content_brand_profiles")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  const { data: project, error } = await ctx.supabase
    .from("content_projects")
    .insert({
      organization_id: ctx.organizationId,
      request_id: briefing.requestId,
      type: briefing.type,
      objective: briefing.objective,
      briefing,
      status: "generating",
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error || !project) throw new Error("CONTENT_PROJECT_CREATE_FAILED");
  try {
    const generated = await provider.generateText(briefing, brand.data ?? {});
    const { data } = await ctx.supabase
      .from("content_projects")
      .update({
        status: "ready_for_review",
        text_content: generated.content,
        updated_at: new Date().toISOString(),
      })
      .eq("id", project.id)
      .eq("organization_id", ctx.organizationId)
      .select("id,status,text_content")
      .single();
    await ctx.supabase
      .from("audit_logs")
      .insert({
        organization_id: ctx.organizationId,
        actor_id: ctx.userId,
        action: "content.text.generated",
        entity_type: "content_project",
        entity_id: project.id,
        metadata: {
          type: briefing.type,
          provider: "openai",
          model: generated.model,
          requestId: briefing.requestId,
          usage: generated.usage,
        },
      });
    await ctx.supabase.from("content_usage_events").insert({organization_id:ctx.organizationId,user_id:ctx.userId,project_id:project.id,request_id:briefing.requestId,kind:"text_generation",provider:"openai",model:generated.model,units:generated.usage??{}});
    return data;
  } catch (error) {
    await ctx.supabase.from("content_usage_events").insert({organization_id:ctx.organizationId,user_id:ctx.userId,project_id:project.id,request_id:briefing.requestId,kind:"failure",error_type:error instanceof Error?error.message:"UNKNOWN"});
    await ctx.supabase
      .from("content_projects")
      .update({ status: "failed" })
      .eq("id", project.id)
      .eq("organization_id", ctx.organizationId);
    throw error;
  }
}
export async function generateContentImage(
  ctx: Ctx,
  provider: ContentProvider,
  projectId: string,
  raw: unknown,
) {
  const briefing = imageBriefingSchema.parse(raw),
    hash = briefingHash(briefing);
  const existing = await ctx.supabase
    .from("content_images")
    .select("id,status,storage_path")
    .eq("organization_id", ctx.organizationId)
    .eq("request_id", briefing.requestId)
    .maybeSingle();
  if (existing.data) return existing.data;
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
    size = (await import("./domain")).imageSize(briefing.format);
  const { data: record, error } = await ctx.supabase
    .from("content_images")
    .insert({
      organization_id: ctx.organizationId,
      project_id: projectId,
      request_id: briefing.requestId,
      briefing_hash: hash,
      model,
      size,
      quality: "medium",
      status: "generating",
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error || !record) throw new Error("IMAGE_RECORD_CREATE_FAILED");
  try {
    const result = await provider.generateImage(briefing),
      path = `${ctx.organizationId}/${projectId}/${record.id}.png`;
    const upload = await ctx.supabase.storage
      .from("content-assets")
      .upload(path, result.bytes, {
        contentType: result.mimeType,
        upsert: false,
      });
    if (upload.error) throw new Error("IMAGE_STORAGE_FAILED");
    const { data } = await ctx.supabase
      .from("content_images")
      .update({
        status: "ready_for_review",
        storage_path: path,
        mime_type: result.mimeType,
        width: result.width,
        height: result.height,
        usage: result.usage ?? {},
      })
      .eq("id", record.id)
      .eq("organization_id", ctx.organizationId)
      .select("id,status,storage_path")
      .single();
    await ctx.supabase.from("content_usage_events").insert({organization_id:ctx.organizationId,user_id:ctx.userId,project_id:projectId,request_id:briefing.requestId,kind:"image_generation",provider:"openai",model,units:result.usage??{}});
    return data;
  } catch (error) {
    await ctx.supabase.from("content_usage_events").insert({organization_id:ctx.organizationId,user_id:ctx.userId,project_id:projectId,request_id:briefing.requestId,kind:"failure",error_type:error instanceof Error?error.message:"UNKNOWN"});
    await ctx.supabase
      .from("content_images")
      .update({ status: "failed" })
      .eq("id", record.id)
      .eq("organization_id", ctx.organizationId);
    throw error;
  }
}
export async function signedContentImage(ctx: Ctx, id: string) {
  const { data } = await ctx.supabase
    .from("content_images")
    .select("storage_path")
    .eq("organization_id", ctx.organizationId)
    .eq("id", id)
    .single();
  if (!data?.storage_path) throw new Error("CONTENT_IMAGE_NOT_FOUND");
  const signed = await ctx.supabase.storage
    .from("content-assets")
    .createSignedUrl(data.storage_path, 900);
  if (signed.error) throw new Error("CONTENT_IMAGE_SIGN_FAILED");
  return signed.data.signedUrl;
}
export async function duplicateContentProject(ctx:Ctx,id:string,requestId:string){const{data:s}=await ctx.supabase.from("content_projects").select("type,objective,platform,briefing,text_content").eq("organization_id",ctx.organizationId).eq("id",id).is("deleted_at",null).single();if(!s)throw new Error("CONTENT_PROJECT_NOT_FOUND");const{data,error}=await ctx.supabase.from("content_projects").insert({organization_id:ctx.organizationId,request_id:requestId,type:s.type,objective:s.objective,platform:s.platform,briefing:s.briefing,text_content:s.text_content,status:"draft",version:1,parent_project_id:id,created_by:ctx.userId}).select("id").single();if(error||!data)throw new Error("CONTENT_DUPLICATE_FAILED");return data;}
export async function createContentVersion(ctx:Ctx,id:string,requestId:string){const{data:s}=await ctx.supabase.from("content_projects").select("type,objective,platform,briefing,text_content,version,parent_project_id").eq("organization_id",ctx.organizationId).eq("id",id).single();if(!s)throw new Error("CONTENT_PROJECT_NOT_FOUND");const{data,error}=await ctx.supabase.from("content_projects").insert({organization_id:ctx.organizationId,request_id:requestId,type:s.type,objective:s.objective,platform:s.platform,briefing:s.briefing,text_content:s.text_content,status:"draft",version:Number(s.version)+1,parent_project_id:s.parent_project_id??id,created_by:ctx.userId}).select("id").single();if(error||!data)throw new Error("CONTENT_VERSION_FAILED");return data;}
