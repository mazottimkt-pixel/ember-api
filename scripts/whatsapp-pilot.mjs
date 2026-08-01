import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { loadLocalEnv } from "./load-env.mjs";
import { assertPilotAuthorized, PILOT_STEPS } from "./whatsapp-pilot-lib.mjs";

const env = loadLocalEnv();
assertPilotAuthorized(env.WHATSAPP_PILOT_AUTHORIZATION);
const urlFile = ".whatsapp-dev-url";
if (!existsSync(urlFile)) throw new Error("WHATSAPP_DEV_ENVIRONMENT_NOT_ACTIVE");
const callbackUrl = readFileSync(urlFile, "utf8").trim();
if (!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com\/api\/webhooks\/whatsapp$/i.test(callbackUrl)) throw new Error("WHATSAPP_CALLBACK_URL_INVALID");
for (const name of ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_BUSINESS_ACCOUNT_ID", "WHATSAPP_TEST_RECIPIENT", "META_APP_SECRET"]) if (!env[name]?.trim()) throw new Error(`${name}_MISSING`);

const state = {
  runId: randomUUID(),
  createdAt: new Date().toISOString(),
  callbackUrl,
  status: "authorized",
  realMessagesSentByRunner: 0,
  steps: PILOT_STEPS.map((id, index) => ({ order: index + 1, id, status: "pending" })),
};
writeFileSync(".whatsapp-pilot-state.json", `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
console.log(JSON.stringify({ authorized: true, runId: state.runId, callbackUrl, steps: state.steps.length, realMessagesSent: 0, next: "Siga docs/WHATSAPP_PILOT.md com supervisão; o runner não inicia mensagens automaticamente." }));
