"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
const settings = z.object({
  name: z.string().trim().min(2).max(120),
  legal_name: z.string().trim().max(160).optional(),
  tax_id: z.string().trim().max(30).optional(),
  phone: z.string().trim().max(30).optional(),
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
      ...(logoPath ? { logo_path: logoPath } : {}),
    })
    .eq("id", organizationId);
  if (error) throw new Error("Não foi possível salvar as configurações");
  revalidatePath("/settings");
}
