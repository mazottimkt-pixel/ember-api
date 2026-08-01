import { createInterface } from "node:readline/promises";
import pg from "pg";
import { loadLocalEnv } from "./load-env.mjs";
import { buildSwitchPlan, digits, maskId, ROLLBACK_CONFIRMATION, SWITCH_CONFIRMATION } from "./whatsapp-switch-lib.mjs";

const env = loadLocalEnv();
const apply = process.argv.includes("--apply");
const rollback = process.argv.includes("--rollback");
const required = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_BUSINESS_ACCOUNT_ID", "WHATSAPP_API_VERSION", "SUPABASE_DB_URL", "META_APP_ID"];
if (!rollback) required.push("WHATSAPP_NEW_PHONE_NUMBER_ID", "WHATSAPP_NEW_BUSINESS_ACCOUNT_ID", "WHATSAPP_NEW_TEST_RECIPIENT");
for (const name of required) if (!env[name]?.trim()) throw new Error(`${name}_MISSING`);

const parseDbUrl = (value) => {
  const match = value.trim().match(/^postgres(?:ql)?:\/\/([^:]+):(.+)@([^:]+):(\d+)\/([^?\s]+)(?:\?.*)?$/);
  if (!match) throw new Error("SUPABASE_DB_URL_INVALID");
  const [, user, wrappedPassword, host, port, database] = match;
  const password = wrappedPassword.startsWith("[") && wrappedPassword.endsWith("]") ? wrappedPassword.slice(1, -1) : wrappedPassword;
  return { user: decodeURIComponent(user), password: decodeURIComponent(password), host, port: Number(port), database: decodeURIComponent(database), ssl: { rejectUnauthorized: false } };
};

const token = env.WHATSAPP_ACCESS_TOKEN;
const headers = { authorization: `Bearer ${token}` };
const graph = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}`;
async function graphGet(path) {
  const response = await fetch(`${graph}/${path}`, { headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`META_READ_FAILED:${response.status}:${data.error?.code ?? "UNKNOWN"}`);
  return data;
}

const client = new pg.Client(parseDbUrl(env.SUPABASE_DB_URL));
await client.connect();
try {
  const currentPhone = digits(env.WHATSAPP_PHONE_NUMBER_ID, "CURRENT_PHONE_NUMBER_ID");
  const currentResult = await client.query("select id,organization_id,phone_number_id,business_account_id,previous_channel_id from public.whatsapp_channels where phone_number_id=$1 and active=true limit 1", [currentPhone]);
  const current = currentResult.rows[0];
  if (!current) throw new Error("CURRENT_ACTIVE_CHANNEL_NOT_FOUND");

  if (rollback) {
    if (!current.previous_channel_id) throw new Error("ROLLBACK_CHANNEL_NOT_AVAILABLE");
    const previousResult = await client.query("select id,phone_number_id,business_account_id from public.whatsapp_channels where id=$1 and organization_id=$2", [current.previous_channel_id, current.organization_id]);
    const previous = previousResult.rows[0];
    if (!previous) throw new Error("ROLLBACK_CHANNEL_NOT_FOUND");
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", operation: "rollback", currentPhone: maskId(current.phone_number_id), rollbackPhone: maskId(previous.phone_number_id) }));
    if (!apply) process.exit(0);
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await prompt.question(`Digite exatamente '${ROLLBACK_CONFIRMATION}' para continuar: `); prompt.close();
    if (answer !== ROLLBACK_CONFIRMATION) throw new Error("EXPLICIT_CONFIRMATION_REQUIRED");
    await client.query("begin");
    try {
      await client.query("update public.whatsapp_channels set active=false,deactivated_at=now(),updated_at=now() where id=$1", [current.id]);
      await client.query("update public.whatsapp_channels set active=true,deactivated_at=null,updated_at=now() where id=$1", [previous.id]);
      await client.query("commit");
    } catch (error) { await client.query("rollback"); throw error; }
    console.log(JSON.stringify({ completed: true, activePhone: maskId(previous.phone_number_id), previousPreserved: true }));
    process.exit(0);
  }

  const nextPhone = digits(env.WHATSAPP_NEW_PHONE_NUMBER_ID, "NEW_PHONE_NUMBER_ID");
  const nextWaba = digits(env.WHATSAPP_NEW_BUSINESS_ACCOUNT_ID, "NEW_BUSINESS_ACCOUNT_ID");
  const nextRecipient = digits(env.WHATSAPP_NEW_TEST_RECIPIENT, "NEW_TEST_RECIPIENT");
  if (!nextRecipient.startsWith("55")) throw new Error("NEW_TEST_RECIPIENT_NOT_BRAZILIAN");
  const [phone, phoneList, apps, permissions] = await Promise.all([
    graphGet(`${nextPhone}?fields=id,display_phone_number,verified_name`),
    graphGet(`${nextWaba}/phone_numbers?fields=id&limit=100`),
    graphGet(`${nextWaba}/subscribed_apps`),
    graphGet("me/permissions"),
  ]);
  if (String(phone.id) !== nextPhone || !(phoneList.data ?? []).some((item) => String(item.id) === nextPhone)) throw new Error("PHONE_DOES_NOT_BELONG_TO_WABA");
  const appIds = (apps.data ?? []).flatMap((item) => [item.id, item.whatsapp_business_api_data?.id]).filter(Boolean).map(String);
  if (!appIds.includes(String(env.META_APP_ID))) throw new Error("WABA_NOT_SUBSCRIBED_TO_EXPECTED_APP");
  const granted = new Set((permissions.data ?? []).filter((item) => item.status === "granted").map((item) => item.permission));
  if (!granted.has("whatsapp_business_messaging") || !granted.has("whatsapp_business_management")) throw new Error("TOKEN_PERMISSIONS_INCOMPLETE");
  const plan = buildSwitchPlan({ id: current.id, phoneNumberId: current.phone_number_id, businessAccountId: current.business_account_id }, { phoneNumberId: nextPhone, businessAccountId: nextWaba });
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...plan, appMatched: true, permissionsValid: true, recipientMasked: maskId(nextRecipient) }));
  if (!apply) process.exit(0);
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(`Digite exatamente '${SWITCH_CONFIRMATION}' para continuar: `); prompt.close();
  if (answer !== SWITCH_CONFIRMATION) throw new Error("EXPLICIT_CONFIRMATION_REQUIRED");
  await client.query("begin");
  try {
    const conflict = await client.query("select id,organization_id from public.whatsapp_channels where phone_number_id=$1 limit 1", [nextPhone]);
    if (conflict.rows[0] && conflict.rows[0].organization_id !== current.organization_id) throw new Error("CHANNEL_BELONGS_TO_ANOTHER_ORGANIZATION");
    if (nextPhone !== current.phone_number_id) await client.query("update public.whatsapp_channels set active=false,deactivated_at=now(),updated_at=now() where id=$1", [current.id]);
    const result = conflict.rows[0]
      ? await client.query("update public.whatsapp_channels set business_account_id=$1,name='Lume WhatsApp Brasil',active=true,deactivated_at=null,previous_channel_id=$2,updated_at=now() where id=$3 returning id", [nextWaba, current.id, conflict.rows[0].id])
      : await client.query("insert into public.whatsapp_channels(organization_id,phone_number_id,business_account_id,name,active,previous_channel_id) values($1,$2,$3,'Lume WhatsApp Brasil',true,$4) returning id", [current.organization_id, nextPhone, nextWaba, current.id]);
    const owner = await client.query("select user_id from public.organization_members where organization_id=$1 and role='owner' order by created_at limit 1", [current.organization_id]);
    if (owner.rows[0]) await client.query("insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values($1,$2,'whatsapp.channel.switched','whatsapp_channel',$3,$4::jsonb)", [current.organization_id, owner.rows[0].user_id, result.rows[0].id, JSON.stringify({ previousChannelId: current.id, source: "whatsapp:switch-channel" })]);
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; }
  console.log(JSON.stringify({ completed: true, activePhone: maskId(nextPhone), activeWaba: maskId(nextWaba), previousChannelPreserved: true, rollbackAvailable: true }));
} finally { await client.end(); }
