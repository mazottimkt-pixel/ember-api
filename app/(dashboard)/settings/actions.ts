"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
import { brandingPalette, DOCUMENT_TEMPLATE_IDS } from "@/lib/branding/identity";
import { validateLogo } from "@/lib/branding/image";
const settings = z.object({
  name: z.string().trim().min(2).max(120),
  legal_name: z.string().trim().max(160).optional(),
  tax_id: z.string().trim().max(30).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.union([z.email(), z.literal("")]).optional(),
  postal_code: z.string().trim().max(9).optional(),
  street: z.string().trim().max(160).optional(),
  street_number: z.string().trim().max(30).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(2).optional(),
});
export async function saveSettings(formData: FormData) {
  const data = settings.parse(Object.fromEntries(formData));
  const { organizationId, supabase } = await requireMembership();
  let logoPath: string | undefined;
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size) {
    if (logo.size > 5 * 1024 * 1024)
      throw new Error("O logotipo deve ter até 5 MB");
    if (!["image/png", "image/jpeg", "image/webp"].includes(logo.type))
      throw new Error("Use PNG, JPEG ou WebP");
    logoPath = `${organizationId}/logo-${Date.now()}.${logo.type.split("/")[1]}`;
    const { error } = await supabase.storage
      .from("organization-assets")
      .upload(logoPath, logo, { contentType: logo.type });
    if (error) throw new Error("Não foi possível enviar o logotipo");
  }
  const { error } = await supabase
    .from("organizations")
    .update({
      name: data.name,
      legal_name: data.legal_name || null,
      tax_id: data.tax_id || null,
      phone: data.phone || null,
      email: data.email || null,
      address: { postal_code: data.postal_code || null, street: data.street || null, number: data.street_number || null, city: data.city || null, state: data.state || null },
      ...(logoPath ? { logo_path: logoPath } : {}),
    })
    .eq("id", organizationId);
  if (error) throw new Error("Não foi possível salvar as configurações");
  revalidatePath("/settings");
}

const profileSchema = z.object({ full_name: z.string().trim().min(2).max(160), email: z.union([z.email(), z.literal("")]), job_title: z.string().trim().max(100).optional() });
export async function saveProfile(formData: FormData) {
  const data = profileSchema.parse(Object.fromEntries(formData));
  const { supabase, user } = await requireMembership();
  const { error } = await supabase.from("profiles").update({ full_name: data.full_name, email: data.email || null, job_title: data.job_title || null }).eq("id", user.id);
  if (error) throw new Error("Não foi possível salvar o responsável");
  revalidatePath("/settings");
}

const brandingSettings = z.object({ template_id: z.enum(DOCUMENT_TEMPLATE_IDS), primary_color: z.string().trim().min(1).max(30) });
export async function saveDocumentBranding(formData: FormData) {
  const data = brandingSettings.parse(Object.fromEntries(formData));
  const { organizationId, supabase, user, role } = await requireMembership();
  if (!['owner', 'admin'].includes(role)) throw new Error("BRANDING_FORBIDDEN");
  const palette = brandingPalette(data.primary_color);
  const current = await supabase.from("document_branding_versions").select("version,logo_storage_path,logo_original_filename,logo_mime_type,logo_width,logo_height,logo_has_transparency")
    .eq("organization_id", organizationId).eq("active", true).maybeSingle();
  let logo = current.data ?? {};
  const upload = formData.get("branding_logo");
  if (upload instanceof File && upload.size) {
    const validated = await validateLogo(upload);
    const storagePath = `${organizationId}/document-branding/${crypto.randomUUID()}.${validated.extension}`;
    const stored = await supabase.storage.from("organization-assets").upload(storagePath, validated.bytes, { contentType: validated.mimeType, upsert: false });
    if (stored.error) throw new Error("BRANDING_LOGO_STORAGE_FAILED");
    logo = { logo_storage_path: storagePath, logo_original_filename: upload.name.slice(0, 255), logo_mime_type: validated.mimeType,
      logo_width: validated.width, logo_height: validated.height, logo_has_transparency: validated.hasTransparency };
  }
  if (formData.get("remove_logo") === "true") logo = {};
  const nextVersion = Number(current.data?.version ?? 0) + 1;
  const created = await supabase.from("document_branding_versions").insert({ organization_id: organizationId, status: "configured",
    template_id: data.template_id, primary_color: palette.primary, contrast_color: palette.contrast,
    light_variant: palette.light, dark_variant: palette.dark, ...logo, version: nextVersion, active: false,
    configured_at: new Date().toISOString(), configured_by: user.id, approved_at: new Date().toISOString() }).select("id").single();
  if (created.error || !created.data) throw new Error("BRANDING_SAVE_FAILED");
  await supabase.from("document_branding_versions").update({ active: false }).eq("organization_id", organizationId).eq("active", true);
  const activated = await supabase.from("document_branding_versions").update({ active: true }).eq("id", created.data.id).eq("organization_id", organizationId);
  if (activated.error) throw new Error("BRANDING_ACTIVATION_FAILED");
  await supabase.from("audit_logs").insert({ organization_id: organizationId, actor_id: user.id, action: "document.branding.configured",
    entity_type: "document_branding", entity_id: created.data.id, metadata: { version: nextVersion, templateId: data.template_id, hasLogo: "logo_storage_path" in logo && Boolean(logo.logo_storage_path) } });
  revalidatePath("/settings");
}

export async function restoreDefaultDocumentBranding() {
  const form = new FormData();
  form.set("template_id", "executive"); form.set("primary_color", "#334155"); form.set("remove_logo", "true");
  return saveDocumentBranding(form);
}
