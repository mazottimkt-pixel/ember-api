import { readFileSync } from "node:fs";
import pg from "pg";
import { loadLocalEnv } from "./load-env.mjs";

const name = "202608060002_commercial_branding_snapshot_repair.sql";
const env = loadLocalEnv();
const url = new URL(env.SUPABASE_DB_URL);
const client = new pg.Client({
  user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
  host: url.hostname, port: Number(url.port), database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});
await client.connect();
try {
  await client.query("begin");
  await client.query(readFileSync(`supabase/migrations/${name}`, "utf8"));
  await client.query("create schema if not exists ember_migrations");
  await client.query("create table if not exists ember_migrations.applied(name text primary key,applied_at timestamptz not null default now())");
  await client.query("insert into ember_migrations.applied(name) values($1) on conflict(name) do nothing", [name]);
  await client.query("commit");
  const column = await client.query(
    "select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='branding_snapshot'",
  );
  const ledger = await client.query("select applied_at from ember_migrations.applied where name=$1", [name]);
  console.log(JSON.stringify({
    migration: name,
    applied: true,
    brandingSnapshotColumn: column.rowCount === 1,
    ledgerRecorded: ledger.rowCount === 1,
  }));
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
