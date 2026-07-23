import { supabase } from "@/lib/supabase";
import { isValidDomain, normalizeDomain } from "@/lib/websites";

const API_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: API_HEADERS });
}

export async function GET(_request: Request, { params }: { params: Promise<{ domain: string }> }) {
  let rawDomain: string;
  try { rawDomain = decodeURIComponent((await params).domain); }
  catch { return Response.json({ error: "Domínio inválido" }, { status: 400, headers: API_HEADERS }); }
  const domain = normalizeDomain(rawDomain);
  if (!isValidDomain(domain)) return Response.json({ error: "Domínio inválido" }, { status: 400, headers: API_HEADERS });

  const { data, error } = await supabase
    .from("websites")
    .select("id, domain, status, price, category, owner, country, created_at, interested")
    .eq("domain", domain)
    .maybeSingle();

  if (error) {
    console.error("Website API query failed", { code: error.code });
    return Response.json({ error: "Não foi possível consultar o site" }, { status: 500, headers: API_HEADERS });
  }
  if (!data) return Response.json({ error: "Site não encontrado" }, { status: 404, headers: API_HEADERS });
  return Response.json(data, { headers: API_HEADERS });
}
