import { randomBytes } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { loadLocalEnv } from "./load-env.mjs";
import { authenticateTestUser, createTestClients, ensureTestUser } from "./auth-test-helpers.mjs";
const env = loadLocalEnv();
for (const key of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TEST_OWNER_EMAIL",
  "TEST_OWNER_PASSWORD",
])
  if (!env[key]) throw new Error(`Variável ausente: ${key}`);
const { admin, createAnon } = createTestClients(env);
const owner = await authenticateTestUser(env, createAnon, env.TEST_OWNER_EMAIL, env.TEST_OWNER_PASSWORD);
const { data: ownerMembership, error: ownerMembershipError } = await owner
  .from("organization_members")
  .select("organization_id,role")
  .single();
if (ownerMembershipError) throw ownerMembershipError;
const ownerOrg = ownerMembership.organization_id;
const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const secondEmail = `rls-test-${projectRef}@example.invalid`;
const secondPassword = `T!${randomBytes(18).toString("base64url")}`;
const secondUser = await ensureTestUser(admin, secondEmail, secondPassword);
let tenantB;
try { tenantB = await authenticateTestUser(env, createAnon, secondEmail, secondPassword); }
catch {
  await admin.auth.admin.updateUserById(secondUser.id, { password: secondPassword });
  tenantB = await authenticateTestUser(env, createAnon, secondEmail, secondPassword);
}
let { data: secondMembership } = await tenantB
  .from("organization_members")
  .select("organization_id,role")
  .maybeSingle();
if (!secondMembership) {
  const { error } = await tenantB.rpc("create_organization", {
    org_name: "RLS Isolation Test",
  });
  if (error) throw error;
  ({ data: secondMembership } = await tenantB
    .from("organization_members")
    .select("organization_id,role")
    .single());
}
const tenantBOrg = secondMembership.organization_id;
const marker = `IT-${Date.now()}`;
const { data: customer, error: customerError } = await owner
  .from("customers")
  .insert({ organization_id: ownerOrg, name: `Cliente ${marker}` })
  .select("id,name,address")
  .single();
if (customerError) throw customerError;
const { data: supplier, error: supplierError } = await owner
  .from("suppliers")
  .insert({ organization_id: ownerOrg, name: `Fornecedor ${marker}` })
  .select("id,name,address")
  .single();
if (supplierError) throw supplierError;
const { data: catalog, error: catalogError } = await owner
  .from("catalog_items")
  .insert({
    organization_id: ownerOrg,
    kind: "service",
    name: `Serviço ${marker}`,
    unit: "un",
    unit_price: 180,
  })
  .select("id")
  .single();
if (catalogError) throw catalogError;
const { data: foreignCustomer, error: foreignError } = await tenantB
  .from("customers")
  .insert({ organization_id: tenantBOrg, name: `Isolado ${marker}` })
  .select("id")
  .single();
if (foreignError) throw foreignError;
const ownerCannotReadForeign =
  (await owner.from("customers").select("id").eq("id", foreignCustomer.id)).data
    ?.length === 0;
const secondCannotReadOwner =
  (await tenantB.from("customers").select("id").eq("id", customer.id)).data
    ?.length === 0;
const crossUpdate = await tenantB
  .from("customers")
  .update({ name: "VIOLATION" })
  .eq("id", customer.id)
  .select("id");
const secondCannotUpdateOwner =
  !crossUpdate.error && crossUpdate.data?.length === 0;
async function createDocument(type, party) {
  const { data: number, error: numberError } = await owner.rpc(
    "next_document_number",
    { org_id: ownerOrg, doc_type: type },
  );
  if (numberError) throw numberError;
  const subtotal = 2160,
    discount = 20,
    shipping = 30,
    total = 2170;
  const { data: doc, error } = await owner
    .from("documents")
    .insert({
      organization_id: ownerOrg,
      type,
      number,
      status: "draft",
      customer_id: type === "quote" ? party.id : null,
      supplier_id: type === "purchase_order" ? party.id : null,
      counterparty_snapshot: party,
      subtotal,
      discount,
      shipping,
      total,
      commercial_terms: {
        validity: "15 dias",
        deadline: "5 dias",
        paymentTerms: "50% na aprovação e 50% na conclusão",
        deliveryAddress: "Endereço de teste",
      },
      issued_by: (await owner.auth.getUser()).data.user.id,
    })
    .select("id,number")
    .single();
  if (error) throw error;
  const { error: itemError } = await owner
    .from("document_items")
    .insert({
      organization_id: ownerOrg,
      document_id: doc.id,
      catalog_item_id: catalog.id,
      position: 1,
      description: "Manutenção de ar-condicionado",
      quantity: 12,
      unit: "un",
      unit_price: 180,
      discount: 20,
      line_total: 2140,
    });
  if (itemError) throw itemError;
  await owner
    .from("document_events")
    .insert({
      organization_id: ownerOrg,
      document_id: doc.id,
      event_type: "draft.created",
      actor_id: (await owner.auth.getUser()).data.user.id,
    });
  const { data: confirmed, error: confirmError } = await owner
    .from("documents")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      confirmed_by: (await owner.auth.getUser()).data.user.id,
    })
    .eq("id", doc.id)
    .eq("status", "draft")
    .select("id")
    .single();
  if (confirmError || !confirmed)
    throw confirmError ?? new Error("Confirmação falhou");
  await owner
    .from("document_events")
    .insert({
      organization_id: ownerOrg,
      document_id: doc.id,
      event_type: "document.confirmed",
      actor_id: (await owner.auth.getUser()).data.user.id,
    });
  return doc;
}
const quote = await createDocument("quote", customer);
const purchaseOrder = await createDocument("purchase_order", supplier);
const pdf = await PDFDocument.create();
const page = pdf.addPage();
const font = await pdf.embedFont(StandardFonts.Helvetica);
page.drawText(`Documento ${quote.number}`, { x: 50, y: 750, font, size: 18 });
const bytes = await pdf.save();
const storagePath = `${ownerOrg}/${quote.id}/integration-${Date.now()}.pdf`;
const { error: uploadError } = await owner.storage
  .from("documents")
  .upload(storagePath, bytes, { contentType: "application/pdf" });
if (uploadError) throw uploadError;
const { error: fileError } = await owner
  .from("files")
  .insert({
    organization_id: ownerOrg,
    document_id: quote.id,
    storage_path: storagePath,
    mime_type: "application/pdf",
    size_bytes: bytes.length,
  });
if (fileError) throw fileError;
const ownerDownload = await owner.storage
  .from("documents")
  .download(storagePath);
const foreignDownload = await tenantB.storage
  .from("documents")
  .download(storagePath);
const { count: eventCount } = await owner
  .from("document_events")
  .select("id", { count: "exact", head: true })
  .in("document_id", [quote.id, purchaseOrder.id]);
const assertions = {
  ownerRole: ownerMembership.role === "owner",
  secondTenantReady: secondMembership.role === "owner",
  ownerCannotReadForeign,
  secondCannotReadOwner,
  secondCannotUpdateOwner,
  numberingDistinct: quote.number !== purchaseOrder.number,
  pdfStored: !uploadError && !fileError,
  pdfOwnerReadable: !ownerDownload.error,
  pdfForeignBlocked: Boolean(foreignDownload.error),
  historyComplete: (eventCount ?? 0) >= 4,
};
if (Object.values(assertions).some((x) => !x))
  throw new Error(
    `Falha de integração: ${Object.entries(assertions)
      .filter(([, v]) => !v)
      .map(([k]) => k)
      .join(",")}`,
  );
console.log(
  JSON.stringify({
    integrationPassed: true,
    assertions,
    documentsCreated: 2,
    pdfBytes: bytes.length,
    eventCount,
  }),
);
