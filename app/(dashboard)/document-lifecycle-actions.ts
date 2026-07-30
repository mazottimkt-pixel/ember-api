"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/session";
export async function archiveDocument(formData: FormData) {
  const id = z.uuid().parse(formData.get("id"));
  const { organizationId, supabase, user } = await requireMembership();
  const { data, error } = await supabase
    .from("documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", organizationId)
    .eq("status", "draft")
    .select("id")
    .single();
  if (error || !data) throw new Error("Somente rascunhos podem ser excluídos");
  await supabase
    .from("document_events")
    .insert({
      organization_id: organizationId,
      document_id: id,
      event_type: "draft.archived",
      actor_id: user.id,
    });
  revalidatePath("/documents");
}
export async function restoreDocument(formData: FormData) {
  const id = z.uuid().parse(formData.get("id"));
  const { organizationId, supabase, user } = await requireMembership();
  const { error } = await supabase
    .from("documents")
    .update({ deleted_at: null })
    .eq("id", id)
    .eq("organization_id", organizationId);
  if (error) throw new Error("Não foi possível restaurar");
  await supabase
    .from("document_events")
    .insert({
      organization_id: organizationId,
      document_id: id,
      event_type: "draft.restored",
      actor_id: user.id,
    });
  revalidatePath("/documents");
}
