"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { databaseErrorMessage, parseWebsiteForm, type WebsiteFormState } from "@/lib/websites";

async function authenticatedClient() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/admin/login");
  return supabase;
}

export async function createWebsite(
  _previousState: WebsiteFormState,
  formData: FormData,
): Promise<WebsiteFormState> {
  const parsed = parseWebsiteForm(formData);
  if ("error" in parsed) return parsed.error;

  const supabase = await authenticatedClient();
  const { error } = await supabase.from("websites").insert(parsed.data);
  if (error) return { error: databaseErrorMessage(error.code) };

  revalidatePath("/admin");
  redirect("/admin");
}

export async function updateWebsite(
  id: string,
  _previousState: WebsiteFormState,
  formData: FormData,
): Promise<WebsiteFormState> {
  if (!id || id.length > 100) return { error: "Identificador inválido." };
  const parsed = parseWebsiteForm(formData);
  if ("error" in parsed) return parsed.error;

  const supabase = await authenticatedClient();
  const { data, error } = await supabase
    .from("websites")
    .update(parsed.data)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return { error: databaseErrorMessage(error.code) };
  if (!data) return { error: "Ativo não encontrado ou sem permissão para edição." };

  revalidatePath("/admin");
  revalidatePath(`/admin/edit/${id}`);
  redirect("/admin");
}

export async function deleteWebsite(id: string): Promise<{ error?: string }> {
  if (!id || id.length > 100) return { error: "Identificador inválido." };
  const supabase = await authenticatedClient();
  const { data, error } = await supabase
    .from("websites")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return { error: "Não foi possível excluir o ativo. Tente novamente." };
  if (!data) return { error: "Ativo não encontrado ou sem permissão para exclusão." };

  revalidatePath("/admin");
  return {};
}
