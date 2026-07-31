import { existsSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { loadLocalEnv } from "./load-env.mjs";
import { extractTryCloudflareUrl, NEXT_ORIGIN, PROXY_ORIGIN, verificationUrl, waitForHttp, WEBHOOK_PATH } from "./whatsapp-dev-lib.mjs";

const env = { ...process.env, ...loadLocalEnv() };
const verifyToken = env.WHATSAPP_VERIFY_TOKEN;
if (!verifyToken) throw new Error("WHATSAPP_VERIFY_TOKEN ausente no .env.local");

const children = [];
const urlFile = join(process.cwd(), ".whatsapp-dev-url");
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children.reverse()) {
    if (!child.pid) continue;
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    else child.kill("SIGTERM");
  }
  try { rmSync(urlFile, { force: true }); } catch {}
}
process.once("SIGINT", () => { stop(); process.exit(0); });
process.once("SIGTERM", () => { stop(); process.exit(0); });
process.once("exit", stop);

function run(command, args, label, options = {}) {
  const child = spawn(command, args, { cwd: process.cwd(), env, windowsHide: true, ...options });
  children.push(child);
  child.once("exit", (code) => { if (!stopping) { console.error(`${label} encerrou inesperadamente (código ${code}). Ambiente NÃO pronto.`); stop(); process.exitCode = 1; } });
  return child;
}

function cloudflaredExecutable() {
  if (env.CLOUDFLARED_PATH && existsSync(env.CLOUDFLARED_PATH)) return env.CLOUDFLARED_PATH;
  const installed = "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe";
  return existsSync(installed) ? installed : "cloudflared";
}

try {
  rmSync(join(process.cwd(), ".next"), { recursive: true, force: true });
  const nextCommand = process.platform === "win32" ? "cmd.exe" : "npm";
  const nextArgs = process.platform === "win32" ? ["/d", "/s", "/c", "npm run dev"] : ["run", "dev"];
  run(nextCommand, nextArgs, "Next.js", { stdio: ["ignore", "pipe", "pipe"] });
  await waitForHttp(`${NEXT_ORIGIN}${WEBHOOK_PATH}`, { expected: [403], timeoutMs: 75_000 });
  console.log("✓ Servidor Next ativo: localhost:3000");

  run(process.execPath, ["scripts/webhook-tunnel-proxy.mjs"], "Proxy restrito", { stdio: ["ignore", "pipe", "pipe"] });
  await waitForHttp(`${PROXY_ORIGIN}${WEBHOOK_PATH}`, { expected: [403], timeoutMs: 20_000 });
  console.log("✓ Proxy restrito ativo: localhost:3100");

  const tunnel = run(cloudflaredExecutable(), ["tunnel", "--no-autoupdate", "--url", PROXY_ORIGIN], "Cloudflare Tunnel", { stdio: ["ignore", "pipe", "pipe"] });
  let tunnelOutput = "";
  const publicOrigin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("TUNNEL_URL_TIMEOUT")), 60_000);
    const inspect = (chunk) => {
      const text = chunk.toString(); tunnelOutput = `${tunnelOutput}${text}`.slice(-20_000);
      const url = extractTryCloudflareUrl(tunnelOutput);
      if (url) { clearTimeout(timer); resolve(url); }
    };
    tunnel.stdout.on("data", inspect); tunnel.stderr.on("data", inspect);
  });
  // Evita registrar NXDOMAIN no cache negativo do Windows antes da propagação do quick tunnel.
  await new Promise((resolve) => setTimeout(resolve, 15_000));
  await waitForHttp(`${publicOrigin}${WEBHOOK_PATH}`, { expected: [403], timeoutMs: 120_000 });
  console.log("✓ Túnel HTTPS ativo");

  const challenge = "EMBER_WHATSAPP_DEV_OK";
  const verification = await waitForHttp(verificationUrl(publicOrigin, verifyToken, challenge), { expected: [200], timeoutMs: 30_000 });
  const body = await verification.text();
  if (body !== challenge) throw new Error("WEBHOOK_CHALLENGE_BODY_INVALID");
  const callbackUrl = `${publicOrigin}${WEBHOOK_PATH}`;
  writeFileSync(urlFile, `${callbackUrl}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(`✓ Callback URL atual: ${callbackUrl}`);
  console.log("✓ GET de verificação: HTTP 200, challenge exato");
  console.log("AMBIENTE WHATSAPP PRONTO");

  if (process.argv.includes("--check")) { stop(); setTimeout(() => process.exit(0), 500); }
  else await new Promise(() => {});
} catch (error) {
  console.error(`AMBIENTE WHATSAPP NÃO PRONTO: ${error instanceof Error ? error.message : "erro desconhecido"}`);
  stop(); process.exitCode = 1;
}
