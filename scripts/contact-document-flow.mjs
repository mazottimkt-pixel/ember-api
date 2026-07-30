import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { loadLocalEnv } from "./load-env.mjs";

const env = loadLocalEnv();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const owner = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  options,
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);
const { error: loginError } = await owner.auth.signInWithPassword({
  email: env.TEST_OWNER_EMAIL,
  password: env.TEST_OWNER_PASSWORD,
});
if (loginError) throw new Error("Falha no login de teste");
const { data: membership } = await owner
  .from("organization_members")
  .select("organization_id")
  .single();
const organizationId = membership.organization_id;
const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const secondEmail = `rls-test-${projectRef}@example.invalid`;
const secondPassword = `T!${randomBytes(18).toString("base64url")}`;
const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
let secondUser = listed.data.users.find((entry) => entry.email === secondEmail);
if (!secondUser) secondUser = (await admin.auth.admin.createUser({ email: secondEmail, password: secondPassword, email_confirm: true })).data.user;
else await admin.auth.admin.updateUserById(secondUser.id, { password: secondPassword });
const second = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options);
await second.auth.signInWithPassword({ email: secondEmail, password: secondPassword });
let { data: secondMembership } = await second.from("organization_members").select("organization_id").maybeSingle();
if (!secondMembership) { await second.rpc("create_organization", { org_name: "RLS Isolation Test" }); secondMembership = (await second.from("organization_members").select("organization_id").single()).data; }
const taxId = "05501893193";
const name = "MATHEUS YAN TEODORO GONÇALVES MAZOTTI";
let { data: contact } = await owner
  .from("business_contacts")
  .select("id,is_customer,is_supplier")
  .eq("tax_id_normalized", taxId)
  .maybeSingle();
if (contact) {
  const { data, error } = await owner
    .from("business_contacts")
    .update({
      legal_name: name,
      is_customer: true,
      is_supplier: true,
      active: true,
      deleted_at: null,
    })
    .eq("id", contact.id)
    .select("id,is_customer,is_supplier")
    .single();
  if (error) throw error;
  contact = data;
} else {
  const { data, error } = await owner
    .from("business_contacts")
    .insert({
      organization_id: organizationId,
      legal_name: name,
      tax_id: taxId,
      person_type: "individual",
      is_customer: true,
      is_supplier: true,
    })
    .select("id,is_customer,is_supplier")
    .single();
  if (error) throw error;
  contact = data;
}
const { data: user } = await owner.auth.getUser();

async function create(type) {
  const { data: number, error: numberError } = await owner.rpc(
    "next_document_number",
    { org_id: organizationId, doc_type: type },
  );
  if (numberError) throw numberError;
  const { data, error } = await owner
    .from("documents")
    .insert({
      organization_id: organizationId,
      request_id: randomUUID(),
      counterparty_id: contact.id,
      type,
      number,
      status: "draft",
      counterparty_snapshot: { id: contact.id, name, tax_id: taxId },
      subtotal: 100,
      total: 100,
      commercial_terms: {
        validity: type === "quote" ? "2027-12-31" : null,
        deadline: "5 dias",
        paymentTerms: "À vista",
        deliveryAddress: type === "purchase_order" ? "Rua Teste, 100" : null,
      },
      issued_by: user.user.id,
    })
    .select("id,number,type,counterparty_id")
    .single();
  if (error) throw error;
  return data;
}

const quote = await create("quote");
const purchase = await create("purchase_order");
const foreignRead = await second.from("business_contacts").select("id").eq("id", contact.id);
const crossTenantInsert = await second.from("business_contacts").insert({ organization_id: organizationId, legal_name: "Violação", person_type: "individual", is_customer: true });
const assertions = {
  sameContactHasBothRoles: contact.is_customer && contact.is_supplier,
  sameContactUsedByBoth: quote.counterparty_id === purchase.counterparty_id,
  quoteSequence: quote.number.startsWith("ORC-"),
  purchaseSequence: purchase.number.startsWith("PC-"),
  independentSequences: quote.number !== purchase.number,
  foreignContactHidden: !foreignRead.error && foreignRead.data.length === 0,
  crossTenantInsertBlocked: Boolean(crossTenantInsert.error),
};
if (Object.values(assertions).some((value) => !value))
  throw new Error("Falha no fluxo unificado");
console.log(
  JSON.stringify({
    contactDocumentFlowPassed: true,
    assertions,
    quoteNumber: quote.number,
    purchaseNumber: purchase.number,
  }),
);
