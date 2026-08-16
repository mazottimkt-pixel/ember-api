import pg from "pg";
import { loadLocalEnv } from "./load-env.mjs";
const url = loadLocalEnv().SUPABASE_DB_URL;
if (!url) throw new Error("SUPABASE_DB_URL ausente");
const db = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});
await db.connect();
const name = "Codex Phase5C runner synthetic",
  state = (org, key) => ({
    version: 2,
    revision: 0,
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
    lastProcessedEvent: null,
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      migrationClassification: null,
      legacyConflicts: [],
    },
  });
async function cleanup(org) {
  await db.query("delete from channel_message_jobs where organization_id=$1", [
    org,
  ]);
  await db.query(
    "delete from channel_conversation_locks where organization_id=$1",
    [org],
  );
  await db.query("delete from conversations where organization_id=$1", [org]);
  await db.query("delete from organizations where id=$1", [org]);
}
try {
  if (process.argv.includes("--seed")) {
    for (const row of (
      await db.query("select id from organizations where name=$1", [name])
    ).rows)
      await cleanup(row.id);
    const org = (
      await db.query(
        "insert into organizations(name) values($1) returning id",
        [name],
      )
    ).rows[0].id;
    for (const kind of ["deferred", "stale"]) {
      const contact = `phase5c-${kind}`,
        key = `${org}:${contact}`,
        conversation = (
          await db.query(
            "insert into conversations(organization_id,whatsapp_contact_id,state,context,conversation_state_v2,conversation_revision_v2) values($1,$2,'menu','{}',$3,0) returning id",
            [org, contact, state(org, contact)],
          )
        ).rows[0].id;
      await db.query(
        "insert into channel_message_jobs(organization_id,channel,external_message_id,kind,normalized_payload,processing_status,received_at,conversation_id,conversation_key,queue_status,available_at,owner_token,lease_expires_at) values($1,'whatsapp',$2,'text',$3,'received',now()-interval '2 sec',$4,$5,$6,now()-interval '1 sec',$7,$8)",
        [
          org,
          `phase5c-${kind}`,
          { text: "olá" },
          conversation,
          key,
          kind === "deferred" ? "deferred" : "processing",
          kind === "stale" ? "11111111-1111-4111-8111-111111111111" : null,
          kind === "stale" ? new Date(Date.now() - 1000) : null,
        ],
      );
    }
    console.log(
      JSON.stringify({ runnerFixturesSeeded: 2, noInboundSent: true }),
    );
  } else if (process.argv.includes("--check")) {
    const org = (
      await db.query("select id from organizations where name=$1", [name])
    ).rows[0]?.id;
    if (!org) throw new Error("RUNNER_FIXTURE_NOT_FOUND");
    const rows = (
        await db.query(
          "select external_message_id,queue_status,state_revision from channel_message_jobs where organization_id=$1 order by external_message_id",
          [org],
        )
      ).rows,
      revisions = (
        await db.query(
          "select whatsapp_contact_id,conversation_revision_v2 from conversations where organization_id=$1 order by whatsapp_contact_id",
          [org],
        )
      ).rows;
    await cleanup(org);
    console.log(
      JSON.stringify({
        runnerCheck: rows.every((row) => row.queue_status === "completed")
          ? "pass"
          : "fail",
        jobs: rows,
        revisions,
        noInboundSent: true,
        syntheticRowsPersisted: false,
      }),
    );
  } else throw new Error("Use --seed ou --check");
} finally {
  await db.end();
}
