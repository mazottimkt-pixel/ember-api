import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { loadLocalEnv } from "./load-env.mjs";

const env = loadLocalEnv();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const owner = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  options,
);
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
const assertions = {
  sameContactHasBothRoles: contact.is_customer && contact.is_supplier,
  sameContactUsedByBoth: quote.counterparty_id === purchase.counterparty_id,
  quoteSequence: quote.number.startsWith("ORC-"),
  purchaseSequence: purchase.number.startsWith("PC-"),
  independentSequences: quote.number !== purchase.number,
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
