import { readFileSync } from "node:fs";
import pg from "pg";
import { loadLocalEnv } from "./load-env.mjs";

const env = loadLocalEnv();
if (!env.SUPABASE_DB_URL) throw new Error("SUPABASE_DB_URL ausente");
const db = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const migrationName = "202608160001_conversation_v2_phase5d.sql";
const fixtureName = "Codex Phase5D synthetic";
const result = {};
try {
  if (process.argv.includes("--apply")) {
    const sql = readFileSync(`supabase/migrations/${migrationName}`, "utf8");
    await db.query("begin");
    await db.query(sql);
    await db.query("commit");
    result.migrationApplied = migrationName;
  }
  const schema = await db.query(`select
    (select count(*)::int from information_schema.columns where table_schema='public' and table_name='channel_message_jobs' and column_name in ('legacy_queue_status','legacy_available_at','legacy_owner_token','legacy_lease_expires_at','v2_eligible','v2_eligible_at')) columns,
    (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('claim_channel_job_legacy','release_channel_job_legacy','recover_channel_jobs_legacy')) functions`);
  result.schema = schema.rows[0];
  if (schema.rows[0].columns !== 6 || schema.rows[0].functions !== 3) throw new Error("PHASE5D_SCHEMA_INCOMPLETE");

  const prior = await db.query("select id from organizations where name=$1", [fixtureName]);
  for (const row of prior.rows) {
    await db.query("delete from channel_message_jobs where organization_id=$1", [row.id]);
    await db.query("delete from channel_conversation_locks where organization_id=$1", [row.id]);
    await db.query("delete from conversations where organization_id=$1", [row.id]);
    await db.query("delete from organizations where id=$1", [row.id]);
  }
  const org = (await db.query("insert into organizations(name) values($1) returning id", [fixtureName])).rows[0].id;
  const key = `${org}:wa:phase5d`;
  const conversation = (await db.query("insert into conversations(organization_id,whatsapp_contact_id,state,context,conversation_state_v2,conversation_revision_v2) values($1,'wa:phase5d','menu','{}',$2,0) returning id", [org, { revision: 0 }])).rows[0].id;

  await db.query("insert into channel_message_jobs(organization_id,channel,external_message_id,kind,normalized_payload,processing_status,received_at,conversation_key,queue_status,available_at,v2_eligible) values($1,'whatsapp','legacy-historical','text','{}','received',now()-interval '1 day',$2,'deferred',now(),false)", [org, `${org}:historical`]);
  const recoveredLegacyByV2 = Number((await db.query("select recover_channel_jobs_v2() count")).rows[0].count);
  const historical = (await db.query("select queue_status from channel_message_jobs where organization_id=$1 and external_message_id='legacy-historical'", [org])).rows[0].queue_status;
  result.legacyBacklogIgnored = recoveredLegacyByV2 === 0 && historical === "deferred";

  const owners = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  const legacyJobs = [];
  for (let index = 0; index < 3; index++) {
    const row = (await db.query("insert into channel_message_jobs(organization_id,channel,external_message_id,kind,normalized_payload,processing_status,received_at,legacy_queue_status,legacy_available_at,v2_eligible) values($1,'whatsapp',$2,'text',$3,'received',now()+($4||' milliseconds')::interval,'received',now(),false) returning id", [org, `rapid-${index + 1}`, { text: ["20 cadeiras", "pretas", "na verdade 30"][index] }, index])).rows[0];
    legacyJobs.push(row.id);
  }
  const firstClaim = (await db.query("select claim_channel_job_legacy($1,$2,$3,$4,60) ok", [legacyJobs[0], key, org, owners[0]])).rows[0].ok;
  const contended = (await db.query("select claim_channel_job_legacy($1,$2,$3,$4,60) ok", [legacyJobs[1], key, org, owners[1]])).rows[0].ok;
  await db.query("update channel_message_jobs set legacy_queue_status='completed' where id=$1", [legacyJobs[0]]);
  await db.query("select release_channel_job_legacy($1,$2,$3,$4)", [legacyJobs[0], key, org, owners[0]]);
  await db.query("update channel_message_jobs set legacy_available_at=now() where id=$1", [legacyJobs[1]]);
  const secondClaim = (await db.query("select claim_channel_job_legacy($1,$2,$3,$4,60) ok", [legacyJobs[1], key, org, owners[1]])).rows[0].ok;
  await db.query("update channel_message_jobs set legacy_queue_status='completed' where id=$1", [legacyJobs[1]]);
  await db.query("select release_channel_job_legacy($1,$2,$3,$4)", [legacyJobs[1], key, org, owners[1]]);
  const thirdClaim = (await db.query("select claim_channel_job_legacy($1,$2,$3,$4,60) ok", [legacyJobs[2], key, org, owners[2]])).rows[0].ok;
  result.lockContention = { firstClaim, contendedDeferred: !contended, secondClaim, thirdClaim };
  await db.query("update channel_message_jobs set legacy_queue_status='completed' where id=$1", [legacyJobs[2]]);
  await db.query("select release_channel_job_legacy($1,$2,$3,$4)", [legacyJobs[2], key, org, owners[2]]);

  let revision = 0;
  for (let index = 1; index <= 10; index++) {
    const id = (await db.query("insert into channel_message_jobs(organization_id,channel,external_message_id,kind,normalized_payload,processing_status,received_at,conversation_id,conversation_key,queue_status,available_at,v2_eligible,v2_eligible_at) values($1,'whatsapp',$2,'text',$3,'responded',now()+($4||' milliseconds')::interval,$5,$6,'received',now(),true,now()) returning id", [org, `v2-${index}`, { text: `turn-${index}` }, index, conversation, key])).rows[0].id;
    const owner = crypto.randomUUID();
    if (!(await db.query("select acquire_channel_lock_v2($1,$2,$3,60) ok", [key, org, owner])).rows[0].ok) throw new Error("V2_LEASE_FAILED");
    const claimed = (await db.query("select id from claim_channel_job_v2($1,$2,$3)", [key, org, owner])).rows[0]?.id;
    if (claimed !== id) throw new Error("V2_ORDERING_FAILED");
    const commit = (await db.query("select commit_conversation_v2_transition($1,$2,$3,$4,$5) result", [conversation, id, owner, revision, { revision: revision + 1, turn: index }])).rows[0].result;
    if (commit !== "committed") throw new Error(`V2_COMMIT_${commit}`);
    revision += 1;
    await db.query("select release_channel_lock_v2($1,$2,$3)", [key, org, owner]);
  }
  result.revisions = (await db.query("select conversation_revision_v2 revision from conversations where id=$1", [conversation])).rows[0].revision;

  const casJob = (await db.query("insert into channel_message_jobs(organization_id,channel,external_message_id,kind,normalized_payload,processing_status,received_at,conversation_id,conversation_key,queue_status,available_at,v2_eligible,v2_eligible_at) values($1,'whatsapp','v2-cas','text','{}','responded',now(),$2,$3,'failed_recoverable',now(),true,now()) returning id", [org, conversation, key])).rows[0].id;
  const casOwner = crypto.randomUUID();
  await db.query("select acquire_channel_lock_v2($1,$2,$3,60)", [key, org, casOwner]);
  await db.query("select id from claim_channel_job_v2($1,$2,$3)", [key, org, casOwner]);
  result.casConflict = (await db.query("select commit_conversation_v2_transition($1,$2,$3,9,$4) result", [conversation, casJob, casOwner, { revision: 10, turn: "stale" }])).rows[0].result;
  result.casRecovered = (await db.query("select commit_conversation_v2_transition($1,$2,$3,10,$4) result", [conversation, casJob, casOwner, { revision: 11, turn: "cas-retry" }])).rows[0].result;
  await db.query("select release_channel_lock_v2($1,$2,$3)", [key, org, casOwner]);

  await db.query("update channel_message_jobs set conversation_id=$2,conversation_key=$3,queue_status='received',available_at=now(),v2_eligible=true,v2_eligible_at=now() where id=$1", [legacyJobs[2], conversation, key]);
  const sharedOwner = crypto.randomUUID();
  await db.query("select acquire_channel_lock_v2($1,$2,$3,60)", [key, org, sharedOwner]);
  const sharedClaim = (await db.query("select id from claim_channel_job_v2($1,$2,$3)", [key, org, sharedOwner])).rows[0]?.id;
  result.sharedJobCommitted = (await db.query("select commit_conversation_v2_transition($1,$2,$3,11,$4) result", [conversation, legacyJobs[2], sharedOwner, { revision: 12, turn: "shared-legacy-v2" }])).rows[0].result;
  await db.query("select release_channel_lock_v2($1,$2,$3)", [key, org, sharedOwner]);
  result.sharedJob = sharedClaim === legacyJobs[2];

  const concurrentKey = `${org}:wa:two-runners`;
  const runnerA = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  const runnerB = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await Promise.all([runnerA.connect(), runnerB.connect()]);
  const ownerA = crypto.randomUUID(), ownerB = crypto.randomUUID();
  const claims = await Promise.all([
    runnerA.query("select acquire_channel_lock_v2($1,$2,$3,60) ok", [concurrentKey, org, ownerA]),
    runnerB.query("select acquire_channel_lock_v2($1,$2,$3,60) ok", [concurrentKey, org, ownerB]),
  ]);
  result.twoRunnersSingleOwner = claims.filter(item => item.rows[0].ok).length === 1;
  await Promise.all([runnerA.end(), runnerB.end()]);

  const staleId = (await db.query("insert into channel_message_jobs(organization_id,channel,external_message_id,kind,normalized_payload,processing_status,received_at,conversation_id,conversation_key,queue_status,available_at,v2_eligible,v2_eligible_at,owner_token,lease_expires_at) values($1,'whatsapp','v2-stale','text','{}','responded',now(),$2,$3,'processing',now(),true,now(),$4,now()-interval '1 second') returning id", [org, conversation, key, crypto.randomUUID()])).rows[0].id;
  result.v2Recovered = Number((await db.query("select recover_channel_jobs_v2() count")).rows[0].count);
  result.staleStatus = (await db.query("select queue_status from channel_message_jobs where id=$1", [staleId])).rows[0].queue_status;

  let duplicateRejected = false;
  try { await db.query("insert into channel_message_jobs(organization_id,channel,external_message_id,kind,normalized_payload,processing_status,received_at) values($1,'whatsapp','v2-1','text','{}','received',now())", [org]); } catch (error) { duplicateRejected = error.code === "23505"; }
  result.duplicateRejected = duplicateRejected;
  result.pass = result.legacyBacklogIgnored && firstClaim && !contended && secondClaim && thirdClaim && result.revisions === 10 && result.casConflict === "cas_conflict" && result.casRecovered === "committed" && result.sharedJob && result.sharedJobCommitted === "committed" && result.twoRunnersSingleOwner && result.v2Recovered === 1 && result.staleStatus === "deferred" && duplicateRejected;
} catch (error) {
  await db.query("rollback").catch(() => undefined);
  throw error;
} finally {
  const orgs = await db.query("select id from organizations where name=$1", [fixtureName]);
  for (const row of orgs.rows) {
    await db.query("delete from channel_message_jobs where organization_id=$1", [row.id]);
    await db.query("delete from channel_conversation_locks where organization_id=$1", [row.id]);
    await db.query("delete from conversations where organization_id=$1", [row.id]);
    await db.query("delete from organizations where id=$1", [row.id]);
  }
  await db.end();
}
console.log(JSON.stringify(result));
if (!result.pass) process.exitCode = 1;
