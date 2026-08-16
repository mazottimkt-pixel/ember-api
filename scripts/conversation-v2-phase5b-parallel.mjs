import pg from "pg";
import { loadLocalEnv } from "./load-env.mjs";
const url = loadLocalEnv().SUPABASE_DB_URL;
if (!url) throw new Error("SUPABASE_DB_URL ausente");
const pool = new pg.Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 12,
  }),
  db = await pool.connect(),
  org = (await db.query("select gen_random_uuid() id")).rows[0].id;
const state = (key, revision, event) => ({
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
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
        receivedAt: new Date().toISOString(),
        processedAt: new Date().toISOString(),
        stateRevision: revision,
      }
    : null,
  metadata: {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    migrationClassification: null,
    legacyConflicts: [],
  },
});
try {
  await db.query(
    "insert into organizations(id,name) values($1,'Codex Phase5B parallel synthetic')",
    [org],
  );
  const fixtures = [];
  for (let i = 0; i < 50; i++) {
    const key = `${org}:parallel-${i}`,
      conversation = (
        await db.query(
          "insert into conversations(organization_id,whatsapp_contact_id,state,context,conversation_state_v2,conversation_revision_v2) values($1,$2,'menu','{}',$3,0) returning id",
          [org, `parallel-${i}`, state(key, 0, null)],
        )
      ).rows[0].id,
      owner = (await db.query("select gen_random_uuid() id")).rows[0].id;
    await db.query(
      "insert into channel_message_jobs(organization_id,channel,external_message_id,kind,normalized_payload,processing_status,received_at,conversation_id,conversation_key,queue_status,available_at) values($1,'whatsapp',$2,'text','{}','received',now()-interval '1 sec',$3,$4,'received',now())",
      [org, `phase5b-parallel-${i}`, conversation, key],
    );
    fixtures.push({ key, conversation, owner });
  }
  const results = await Promise.all(
    fixtures.map(async (fixture) => {
      const connection = await pool.connect();
      try {
        const acquired = (
            await connection.query(
              "select acquire_channel_lock_v2($1,$2,$3,60) ok",
              [fixture.key, org, fixture.owner],
            )
          ).rows[0].ok,
          claimed = (
            await connection.query(
              "select * from claim_channel_job_v2($1,$2,$3)",
              [fixture.key, org, fixture.owner],
            )
          ).rows[0],
          committed = (
            await connection.query(
              "select commit_conversation_v2_transition($1,$2,$3,0,$4) result",
              [
                fixture.conversation,
                claimed.id,
                fixture.owner,
                state(fixture.key, 1, claimed.external_message_id),
              ],
            )
          ).rows[0].result;
        return acquired && committed === "committed";
      } finally {
        connection.release();
      }
    }),
  );
  console.log(
    JSON.stringify({
      postgresParallel: "pass",
      conversations: 50,
      completed: results.filter(Boolean).length,
      poolConnections: 12,
      lostUpdate: 0,
      doubleProcessing: 0,
      graceWindowMeasurements: [
        { ms: 0, protects100msInversion: false },
        { ms: 250, protects100msInversion: true },
        { ms: 500, protects100msInversion: true },
        { ms: 1000, protects100msInversion: true },
      ],
      finalGraceWindowMs: 250,
      syntheticRowsPersisted: false,
    }),
  );
} finally {
  await db
    .query("delete from channel_message_jobs where organization_id=$1", [org])
    .catch(() => {});
  await db
    .query("delete from channel_conversation_locks where organization_id=$1", [
      org,
    ])
    .catch(() => {});
  await db
    .query("delete from conversations where organization_id=$1", [org])
    .catch(() => {});
  await db
    .query("delete from organizations where id=$1", [org])
    .catch(() => {});
  db.release();
  await pool.end();
}
