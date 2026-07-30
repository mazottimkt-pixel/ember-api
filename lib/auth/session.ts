import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireSession() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}
export async function requireMembership() {
  const { supabase, user } = await requireSession();
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id,role,organizations(name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Não foi possível validar a organização");
  if (!data) redirect("/onboarding");
  return {
    supabase,
    user,
    organizationId: data.organization_id,
    role: data.role,
    organization: data.organizations,
  };
}
