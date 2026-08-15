import { readFileSync } from "node:fs";
import pg from "pg";
import { loadLocalEnv } from "./load-env.mjs";
const allowed = new Set([
    "202608050001_operational_module.sql",
  "202608050002_operational_guards.sql",
  "202608050003_content_marketing.sql",
  "202608050004_closeout.sql",
  ]),
  name = process.argv[2] ?? "202608050001_operational_module.sql";
if (!allowed.has(name)) throw new Error("Migration operacional não permitida");
const env = loadLocalEnv(),
  match = env.SUPABASE_DB_URL?.trim().match(
    /^postgres(?:ql)?:\/\/([^:]+):(.+)@([^:]+):(\d+)\/([^?\s]+)(?:\?.*)?$/,
  );
if (!match) throw new Error("SUPABASE_DB_URL inválida");
const [, rawUser, rawPassword, host, port, rawDatabase] = match,
  password =
    rawPassword.startsWith("[") && rawPassword.endsWith("]")
      ? rawPassword.slice(1, -1)
      : rawPassword,
  client = new pg.Client({
    user: decodeURIComponent(rawUser),
    password: decodeURIComponent(password),
    host,
    port: Number(port),
    database: decodeURIComponent(rawDatabase),
    ssl: { rejectUnauthorized: false },
  });
await client.connect();
try {
  await client.query("create schema if not exists ember_migrations");
  await client.query(
    "create table if not exists ember_migrations.applied(name text primary key,applied_at timestamptz not null default now())",
  );
  if (
    (
      await client.query(
        "select 1 from ember_migrations.applied where name=$1",
        [name],
      )
    ).rowCount
  )
    console.log(
      JSON.stringify({
        migration: name,
        applied: false,
        reason: "already_applied",
      }),
    );
  else {
    await client.query("begin");
    try {
      await client.query(readFileSync(`supabase/migrations/${name}`, "utf8"));
      await client.query(
        "insert into ember_migrations.applied(name) values($1)",
        [name],
      );
      await client.query("commit");
      console.log(JSON.stringify({ migration: name, applied: true }));
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
} finally {
  await client.end();
}
