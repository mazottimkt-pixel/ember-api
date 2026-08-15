export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    {
      status: "live",
      service: "lume-web-api",
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
