import { NextResponse } from "next/server";
import { requireMembership } from "@/lib/auth/session";
import { loadDashboardData, parseDashboardPeriod } from "@/lib/dashboard/metrics";
export async function GET(request: Request) {
  const { supabase, organizationId } = await requireMembership();
  const period = parseDashboardPeriod(new URL(request.url).searchParams.get("period") ?? undefined);
  try { return NextResponse.json(await loadDashboardData(supabase, organizationId, period)); }
  catch { return NextResponse.json({ error: "Não foi possível carregar os indicadores." }, { status: 500 }); }
}
