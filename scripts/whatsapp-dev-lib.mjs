export const WEBHOOK_PATH = "/api/webhooks/whatsapp";
export const NEXT_ORIGIN = "http://127.0.0.1:3000";
export const PROXY_ORIGIN = "http://127.0.0.1:3100";

export function extractTryCloudflareUrl(text) {
  return text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)?.[0] ?? null;
}

export async function waitForHttp(url, options = {}) {
  const expected = options.expected ?? [200];
  const deadline = Date.now() + (options.timeoutMs ?? 60_000);
  let lastStatus = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(3_000) });
      lastStatus = response.status;
      if (expected.includes(response.status)) return response;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`HEALTHCHECK_FAILED:${url}:HTTP_${lastStatus ?? "UNREACHABLE"}`);
}

export function verificationUrl(origin, token, challenge) {
  const url = new URL(WEBHOOK_PATH, origin);
  url.searchParams.set("hub.mode", "subscribe");
  url.searchParams.set("hub.verify_token", token);
  url.searchParams.set("hub.challenge", challenge);
  return url;
}

export async function signedPostHealth(origin, appSecret) {
  const { createHmac } = await import("node:crypto");
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
  const signature = `sha256=${createHmac("sha256", appSecret).update(body).digest("hex")}`;
  const response = await fetch(`${origin}${WEBHOOK_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": signature },
    body,
    redirect: "manual",
    signal: AbortSignal.timeout(5_000),
  });
  if (response.status !== 200) throw new Error(`SIGNED_POST_HEALTH_FAILED:HTTP_${response.status}`);
  const result = await response.json();
  if (result?.received !== true || result?.eventCount !== 0) throw new Error("SIGNED_POST_HEALTH_BODY_INVALID");
  return response.status;
}
