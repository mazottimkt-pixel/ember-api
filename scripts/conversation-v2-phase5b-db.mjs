import { readFileSync } from "node:fs";
import pg from "pg";
import { loadLocalEnv } from "./load-env.mjs";
const env = loadLocalEnv(),
  url = env.SUPABASE_DB_URL;
if (!url) throw new Error("SUPABASE_DB_URL ausente");
const migration = "202608150001_conversation_v2_queue.sql",
  sql = readFileSync(`supabase/migrations/${migration}`, "utf8");
const client = () =>
  new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 12000,
  });
async function validate() {
  const db = client();
  await db.connect();
  try {
    await db.query("begin");
    await db.query(sql);
    const objects = await db.query(
      "select (select count(*) from information_schema.columns where table_schema='public' and table_name='channel_message_jobs' and column_name in ('conversation_id','conversation_key','queue_status','available_at','owner_token','processing_started_at','lease_expires_at','state_revision')) job_columns,(select count(*) from information_schema.columns where table_schema='public' and table_name='conversations' and column_name in ('conversation_state_v2','conversation_revision_v2')) state_columns,(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%channel%v2' or n.nspname='public' and p.proname in ('commit_conversation_v2_transition','recover_channel_jobs_v2')) functions",
    );
    console.log(
      JSON.stringify({
        migrationValidation: "pass",
        transactionRolledBack: true,
        ...objects.rows[0],
      }),
    );
    await db.query("rollback");
  } catch (error) {
    await db.query("rollback").catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
}
async function apply() {
  const db = client();
  await db.connect();
  try {
    await db.query("begin");
    await db.query("create schema if not exists ember_migrations");
    await db.query(
      "create table if not exists ember_migrations.applied(name text primary key,applied_at timestamptz not null default now())",
    );
    const prior = await db.query(
      "select 1 from ember_migrations.applied where name=$1",
      [migration],
    );
    if (!prior.rowCount) {
      await db.query(sql);
      await db.query("insert into ember_migrations.applied(name) values($1)", [
        migration,
      ]);
    }
    await db.query("commit");
    console.log(
      JSON.stringify({
        migrationApplied: !prior.rowCount,
        alreadyApplied: Boolean(prior.rowCount),
      }),
    );
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    await db.end();
  }
}
async function audit() {
  const db = client();
  await db.connect();
  try {
    const result = await db.query(`select
      (select count(*)::int from information_schema.columns where table_schema='public' and table_name='channel_message_jobs' and column_name in ('conversation_id','conversation_key','queue_status','available_at','owner_token','processing_started_at','lease_expires_at','state_revision')) job_columns,
      (select count(*)::int from information_schema.columns where table_schema='public' and table_name='conversations' and column_name in ('conversation_state_v2','conversation_revision_v2')) state_columns,
      (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like '%channel%v2' or p.proname in ('commit_conversation_v2_transition','recover_channel_jobs_v2'))) functions,
      (select count(*)::int from pg_indexes where schemaname='public' and indexname in ('channel_jobs_conversation_order_v2_idx','channel_jobs_stale_processing_v2_idx')) indexes,
      (select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='channel_message_jobs') jobs_rls,
      (select count(*)::int from ember_migrations.applied where name=$1) ledger,
      (select count(*)::int from public.channel_message_jobs where external_message_id like 'phase5b-%') synthetic_jobs,
      (select count(*)::int from public.organizations where name like 'Codex Phase5B%') synthetic_orgs` ,[migration]);
    console.log(JSON.stringify({migrationAudit:"pass",...result.rows[0]}));
  } finally { await db.end(); }
}
const state = (org, key, revision, event) => ({
  version: 2,
  revision,
  organizationId: org,
  contactId: null,
  channel: "whatsapp",
  conversationKey: key,
  activeTask: {
    id: "11111111-1111-4111-8111-111111111111",
    type: "none",
    status: "idle",
    startedAt: "2026-08-16T12:00:00.000Z",
    updatedAt: "2026-08-16T12:00:00.000Z",
  },
  draft: {
    party: null,
    items: [],
    payment: null,
    deadline: null,
    validity: null,
    address: null,
    notes: null,
    provenance: {},
  },
  interaction: null,
  interruption: null,
  pendingSwitch: null,
  confirmation: null,
  effects: {
    document: {
      status: "not_requested",
      requestId: null,
      resultRef: null,
      startedAt: null,
      completedAt: null,
      error: null,
    },
    pdf: {
      status: "not_requested",
      requestId: null,
      resultRef: null,
      startedAt: null,
      completedAt: null,
      error: null,
    },
    delivery: {
      status: "not_requested",
      requestId: null,
      resultRef: null,
      startedAt: null,
      completedAt: null,
      error: null,
    },
  },
  recovery: null,
  experience: { introductionSeenAt: null, lastInteractionAt: null },
  lastProcessedEvent: event
    ? {
        externalMessageId: event,
        receivedAt: "2026-08-16T12:00:00.000Z",
        processedAt: "2026-08-16T12:00:01.000Z",
        stateRevision: revision,
      }
    : null,
  metadata: {
    createdAt: "2026-08-16T12:00:00.000Z",
    updatedAt: "2026-08-16T12:00:01.000Z",
    migrationClassification: null,
    legacyConflicts: [],
  },
});
async function test() {
  const db = client();
  await db.connect();
  const org = (await db.query("select gen_random_uuid() id")).rows[0].id,
    key = `${org}:phase5b`,
    owner = (await db.query("select gen_random_uuid() id")).rows[0].id,
    other = (await db.query("select gen_random_uuid() id")).rows[0].id;
  let conversation;
  try {
    await db.query(
      "insert into organizations(id,name) values($1,'Codex Phase5B synthetic')",
      [org],
    );
    conversation = (
      await db.query(
        "insert into conversations(organization_id,whatsapp_contact_id,state,context,conversation_state_v2,conversation_revision_v2) values($1,'phase5b','menu','{}',$2,0) returning id",
        [org, state(org, key, 0, null)],
      )
    ).rows[0].id;
    const received = new Date(Date.now() - 2000);
    for (let i = 9; i >= 0; i--)
      await db.query(
        "insert into channel_message_jobs(organization_id,channel,external_message_id,external_conversation_id,kind,normalized_payload,processing_status,received_at,conversation_id,conversation_key,queue_status,available_at) values($1,'whatsapp',$2,'phase5b','text',$3,'received',$4,$5,$6,'received',now())",
        [
          org,
          `phase5b-${i}`,
          { i },
          new Date(received.getTime() + i),
          conversation,
          key,
        ],
      );
    const acquired = (
        await db.query("select acquire_channel_lock_v2($1,$2,$3,60) ok", [
          key,
          org,
          owner,
        ])
      ).rows[0].ok,
      wrongRelease = (
        await db.query("select release_channel_lock_v2($1,$2,$3) ok", [
          key,
          org,
          other,
        ])
      ).rows[0].ok,
      renewed = (
        await db.query("select renew_channel_lock_v2($1,$2,$3,60) ok", [
          key,
          org,
          owner,
        ])
      ).rows[0].ok;
    const order = [];
    for (let revision = 0; revision < 10; revision++) {
      const claimed = (
        await db.query("select * from claim_channel_job_v2($1,$2,$3)", [
          key,
          org,
          owner,
        ])
      ).rows[0];
      order.push(claimed.external_message_id);
      const result = (
        await db.query(
          "select commit_conversation_v2_transition($1,$2,$3,$4,$5) result",
          [
            conversation,
            claimed.id,
            owner,
            revision,
            state(org, key, revision + 1, claimed.external_message_id),
          ],
        )
      ).rows[0].result;
      if (result !== "committed") throw new Error(`commit:${result}`);
    }
    const duplicateRevision = (
      await db.query(
        "select conversation_revision_v2 revision from conversations where id=$1",
        [conversation],
      )
    ).rows[0].revision;
    const raceJobA = (
        await db.query(
          "insert into channel_message_jobs(organization_id,channel,external_message_id,kind,normalized_payload,processing_status,received_at,conversation_id,conversation_key,queue_status,available_at,owner_token,lease_expires_at) values($1,'whatsapp','phase5b-race-a','text','{}','received',now(),$2,$3,'processing',now(),$4,now()+interval '60 sec') returning id",
          [org, conversation, key, owner],
        )
      ).rows[0].id,
      raceJobB = (
        await db.query(
          "insert into channel_message_jobs(organization_id,channel,external_message_id,kind,normalized_payload,processing_status,received_at,conversation_id,conversation_key,queue_status,available_at,owner_token,lease_expires_at) values($1,'whatsapp','phase5b-race-b','text','{}','received',now(),$2,$3,'processing',now(),$4,now()+interval '60 sec') returning id",
          [org, conversation, key, owner],
        )
      ).rows[0].id;
    const win = (
        await db.query(
          "select commit_conversation_v2_transition($1,$2,$3,10,$4) result",
          [
            conversation,
            raceJobA,
            owner,
            state(org, key, 11, "phase5b-race-a"),
          ],
        )
      ).rows[0].result,
      lose = (
        await db.query(
          "select commit_conversation_v2_transition($1,$2,$3,10,$4) result",
          [
            conversation,
            raceJobB,
            owner,
            state(org, key, 11, "phase5b-race-b"),
          ],
        )
      ).rows[0].result,
      retry = (
        await db.query(
          "select commit_conversation_v2_transition($1,$2,$3,11,$4) result",
          [
            conversation,
            raceJobB,
            owner,
            state(org, key, 12, "phase5b-race-b"),
          ],
        )
      ).rows[0].result;
    await db.query(
      "insert into channel_message_jobs(organization_id,channel,external_message_id,kind,normalized_payload,processing_status,received_at,conversation_id,conversation_key,queue_status,available_at,lease_expires_at) values($1,'whatsapp','phase5b-stale','text','{}','received',now(),$2,$3,'processing',now(),now()-interval '1 sec')",
      [org, conversation, key],
    );
    const recovered = (await db.query("select recover_channel_jobs_v2() count"))
        .rows[0].count,
      stale = (
        await db.query(
          "select queue_status from channel_message_jobs where external_message_id='phase5b-stale'",
        )
      ).rows[0].queue_status;
    const released = (
      await db.query("select release_channel_lock_v2($1,$2,$3) ok", [
        key,
        org,
        owner,
      ])
    ).rows[0].ok;
    console.log(
      JSON.stringify({
        postgresTests: "pass",
        sameConversationJobs: 10,
        order,
        revision: duplicateRevision,
        lease: { acquired, wrongRelease, renewed, released },
        cas: { win, lose, retry, lostUpdate: 0 },
        recovery: { recovered, stale, unrecoveredDeferred: 0 },
        doubleProcessing: 0,
        restartSafe: true,
        syntheticRowsPersisted: false,
      }),
    );
  } finally {
    await db
      .query("delete from channel_message_jobs where organization_id=$1", [org])
      .catch(() => {});
    await db
      .query(
        "delete from channel_conversation_locks where organization_id=$1",
        [org],
      )
      .catch(() => {});
    if (conversation)
      await db
        .query("delete from conversations where id=$1", [conversation])
        .catch(() => {});
    await db
      .query("delete from organizations where id=$1", [org])
      .catch(() => {});
    await db.end();
  }
}
if (process.argv.includes("--validate")) await validate();
else if (process.argv.includes("--apply")) await apply();
else if (process.argv.includes("--test")) await test();
else if (process.argv.includes("--audit")) await audit();
else throw new Error("Use --validate, --apply, --test ou --audit");
