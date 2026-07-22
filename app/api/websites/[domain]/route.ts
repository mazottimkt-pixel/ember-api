import { supabase } from "@/lib/supabase";

export async function GET(
  request: Request,
  context: { params: Promise<{ domain: string }> }
) {
  const { domain } = await context.params;

  const { data: website, error } = await supabase
    .from("websites")
    .select("*")
    .eq("domain", domain)
    .single();

  if (error || !website) {
    return Response.json(
      {
        error: "Site não encontrado",
      },
      {
        status: 404,
      }
    );
  }

  return Response.json(website);
}