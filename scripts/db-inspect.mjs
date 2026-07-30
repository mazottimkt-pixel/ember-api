import pg from "pg";
import { loadLocalEnv } from "./load-env.mjs";

Object.assign(process.env, loadLocalEnv());
const required = ["SUPABASE_DB_URL"];
for (const key of required) if (!process.env[key]) throw new Error(`Variável ausente: ${key}`);

const match = process.env.SUPABASE_DB_URL.trim().match(/^postgres(?:ql)?:\/\/([^:]+):(.+)@([^:]+):(\d+)\/([^?\s]+)(?:\?.*)?$/);
if (!match) throw new Error("SUPABASE_DB_URL não está no formato PostgreSQL esperado");
const [, user, rawPassword, host, port, database] = match;
const unwrapped = rawPassword.startsWith("[") && rawPassword.endsWith("]") ? rawPassword.slice(1, -1) : rawPassword;
const client = new pg.Client({ user:decodeURIComponent(user),password:decodeURIComponent(unwrapped),host,port:Number(port),database:decodeURIComponent(database),ssl:{rejectUnauthorized:false},connectionTimeoutMillis:12000 });
try {
  await client.connect();
  const version = await client.query("select current_database() database, current_user role, current_setting('server_version') version");
  const schemas = await client.query("select schema_name from information_schema.schemata where schema_name not like 'pg_%' order by 1");
  const tables = await client.query("select table_schema, table_name from information_schema.tables where table_schema in ('public','auth','storage') and table_type='BASE TABLE' order by 1,2");
  const policies = await client.query("select schemaname, tablename, policyname, cmd from pg_policies where schemaname in ('public','storage') order by 1,2,3");
  const migrations = await client.query("select exists(select 1 from information_schema.tables where table_schema='supabase_migrations' and table_name='schema_migrations') present");
  console.log(JSON.stringify({ connected: true, database: version.rows[0].database, role: version.rows[0].role, version: version.rows[0].version.split(' ')[0], schemas: schemas.rowCount, tables: tables.rows, policies: policies.rows, migrationTable: migrations.rows[0].present }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ connected: false, error: error instanceof Error ? error.message.replace(/postgresql:\/\/[^@]+@/g, 'postgresql://***@') : "unknown" }));
  process.exitCode = 1;
} finally { await client.end().catch(()=>{}); }
