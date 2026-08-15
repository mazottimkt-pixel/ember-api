export const dynamic = "force-dynamic";

export function GET() {
  const configured = Boolean(
    process.env.WHATSAPP_VERIFY_TOKEN &&
      process.env.META_APP_SECRET &&
      process.env.WHATSAPP_ACCESS_TOKEN &&
      process.env.WHATSAPP_PHONE_NUMBER_ID,
  );
  return Response.json(
    { status: configured ? "ready" : "not_ready", signatureVerification: configured },
    { status: configured ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
