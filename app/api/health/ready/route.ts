import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const requiredEnvironment = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "META_APP_SECRET",
] as const;

export async function GET() {
  if (requiredEnvironment.some((name) => !process.env[name]))
    return Response.json(
      { status: "not_ready", reason: "configuration" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  try {
    const result = await createSupabaseAdminClient()
      .from("whatsapp_channels")
      .select("id")
      .limit(1);
    if (result.error) throw new Error("DATABASE_UNAVAILABLE");
    return Response.json(
      { status: "ready", database: "reachable", timestamp: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "not_ready", reason: "dependency" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
