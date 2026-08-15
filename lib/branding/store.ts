import type { AgentToolContext } from "@/lib/ai/tools";
import { brandingPalette, defaultBrandingSnapshot, type BrandingStatus, type DocumentTemplateId } from "./identity";

export async function activeBranding(ctx: AgentToolContext) {
  const result = await ctx.supabase.from("document_branding_versions").select("*").eq("organization_id", ctx.organizationId).eq("active", true).maybeSingle();
  return result.error ? null : result.data as Record<string, unknown> | null;
}

export async function persistBranding(ctx: AgentToolContext, input: { status: BrandingStatus; templateId?: DocumentTemplateId; primaryColor?: string; logoStoragePath?: string | null }) {
  const current = await activeBranding(ctx);
  const version = Number(current?.version ?? 0) + 1;
  const palette = brandingPalette(input.primaryColor ?? defaultBrandingSnapshot().primaryColor);
  const created = await ctx.supabase.from("document_branding_versions").insert({ organization_id: ctx.organizationId, status: input.status,
    template_id: input.templateId ?? "executive", primary_color: palette.primary, contrast_color: palette.contrast,
    light_variant: palette.light, dark_variant: palette.dark, logo_storage_path: input.logoStoragePath ?? null,
    version, active: false, configured_at: input.status === "configured" ? new Date().toISOString() : null,
    configured_by: ctx.userId, approved_at: input.status === "configured" ? new Date().toISOString() : null }).select("id").single();
  if (created.error || !created.data) throw new Error("BRANDING_SAVE_FAILED");
  await ctx.supabase.from("document_branding_versions").update({ active: false }).eq("organization_id", ctx.organizationId).eq("active", true);
  const activated = await ctx.supabase.from("document_branding_versions").update({ active: true }).eq("id", created.data.id).eq("organization_id", ctx.organizationId);
  if (activated.error) throw new Error("BRANDING_ACTIVATION_FAILED");
  return created.data;
}
