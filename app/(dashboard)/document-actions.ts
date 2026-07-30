"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/auth/session";
export async function confirmDocument(formData: FormData) {
  const id = z.uuid().parse(formData.get("id"));
  const { organizationId, supabase, user } = await requireMembership();
  const { data, error } = await supabase
    .from("documents")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      confirmed_by: user.id,
    })
    .eq("id", id)
    .eq("organization_id", organizationId)
    .eq("status", "draft")
    .select("id")
    .single();
  if (error || !data)
    throw new Error("Somente rascunhos podem ser confirmados");
  await supabase
    .from("document_events")
    .insert({
      organization_id: organizationId,
      document_id: id,
      event_type: "document.confirmed",
      actor_id: user.id,
    });
  revalidatePath(`/documents/${id}`);
  redirect(`/documents/${id}?confirmed=1`);
}
