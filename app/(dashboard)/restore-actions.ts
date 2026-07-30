"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
export async function restoreParty(
  kind: "customers" | "suppliers",
  formData: FormData,
) {
  const id = z.uuid().parse(formData.get("id"));
  const { organizationId, supabase } = await requireMembership();
  const { error } = await supabase
    .from(kind)
    .update({ deleted_at: null })
    .eq("id", id)
    .eq("organization_id", organizationId);
  if (error) throw new Error("Não foi possível restaurar o cadastro");
  revalidatePath(kind === "customers" ? "/customers" : "/suppliers");
}
export async function restoreCatalog(formData: FormData) {
  const id = z.uuid().parse(formData.get("id"));
  const { organizationId, supabase } = await requireMembership();
  const { error } = await supabase
    .from("catalog_items")
    .update({ deleted_at: null })
    .eq("id", id)
    .eq("organization_id", organizationId);
  if (error) throw new Error("Não foi possível restaurar o item");
  revalidatePath("/catalog");
}
