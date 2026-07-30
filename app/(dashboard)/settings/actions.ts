"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
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
