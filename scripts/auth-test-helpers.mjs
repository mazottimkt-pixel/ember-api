import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};

export function createTestClients(env) {
  return {
    admin: createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, clientOptions),
    createAnon: () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, clientOptions),
  };
}

function cachePath(projectUrl, email) {
  const key = createHash("sha256").update(`${projectUrl}:${email}`).digest("hex").slice(0, 24);
  return join(tmpdir(), `ember-rls-session-${key}.json`);
}

function tokenExpiresAt(accessToken) {
  try { return JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8")).exp * 1000; }
  catch { return 0; }
}

export async function authenticateTestUser(env, createAnon, email, password) {
  const path = cachePath(env.NEXT_PUBLIC_SUPABASE_URL, email);
  try {
    const cached = JSON.parse(await readFile(path, "utf8"));
    if (typeof cached.accessToken === "string" && tokenExpiresAt(cached.accessToken) > Date.now() + 60_000) {
      return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        ...clientOptions, global: { headers: { Authorization: `Bearer ${cached.accessToken}` } },
      });
    }
  } catch {}
  const client = createAnon();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`AUTH_PASSWORD:${error?.status ?? "unknown"}:${error?.code ?? "unknown"}`);
  await writeFile(path, JSON.stringify({ accessToken: data.session.access_token }), { encoding: "utf8", mode: 0o600 });
  return client;
}

export async function clearCachedTestSession(env, email) {
  await unlink(cachePath(env.NEXT_PUBLIC_SUPABASE_URL, email)).catch(() => undefined);
}

export async function ensureTestUser(admin, email, password) {
  let user = null;
  for (let page = 1; page <= 10 && !user; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    user = data.users.find((entry) => entry.email === email) ?? null;
    if (data.users.length < 100) break;
  }
  if (user) return user;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("TEST_USER_NOT_CREATED");
  return data.user;
}
