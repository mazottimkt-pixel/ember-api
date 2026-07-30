import { spawnSync } from "node:child_process";
import { clearCachedTestSession } from "./auth-test-helpers.mjs";
import { loadLocalEnv } from "./load-env.mjs";

const env = loadLocalEnv();
const runs = Math.max(1, Number(process.argv[2]) || 20);
const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const secondEmail = `rls-test-${projectRef}@example.invalid`;
const scripts = ["scripts/integration-flow.mjs", "scripts/contact-document-flow.mjs"];
const startedAt = Date.now();
let completed = 0;

try {
  for (let iteration = 1; iteration <= runs; iteration += 1) {
    for (const script of scripts) {
      const result = spawnSync(process.execPath, [script], { cwd: process.cwd(), encoding: "utf8", timeout: 180_000 });
      if (result.status !== 0) {
        const code = /AUTH_[A-Z]+:[^\s]+/.exec(result.stderr)?.[0] ?? "INTEGRATION_FAILED";
        throw new Error(`iteration=${iteration} script=${script} code=${code}`);
      }
    }
    completed += 1;
    console.log(JSON.stringify({ iteration, passed: true }));
  }
  console.log(JSON.stringify({ stabilityPassed: true, completed, scriptsPerIteration: scripts.length, durationMs: Date.now() - startedAt }));
} finally {
  await Promise.all([clearCachedTestSession(env, env.TEST_OWNER_EMAIL), clearCachedTestSession(env, secondEmail)]);
}
