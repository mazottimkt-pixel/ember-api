import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv } from "./load-env.mjs";
const env = loadLocalEnv(),
  client = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
const { error: loginError } = await client.auth.signInWithPassword({
  email: env.TEST_OWNER_EMAIL,
  password: env.TEST_OWNER_PASSWORD,
});
if (loginError) throw new Error("Falha ao autenticar para seed");
const { data: member } = await client
    .from("organization_members")
    .select("organization_id")
    .single(),
  org = member.organization_id,
  user = (await client.auth.getUser()).data.user;
async function ensure(table, name, payload) {
  const { data: found } = await client
    .from(table)
    .select("*")
    .eq("name", name)
    .is("deleted_at", null)
    .maybeSingle();
  if (found) return found;
  const { data, error } = await client
    .from(table)
    .insert({ organization_id: org, name, ...payload })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
const customer = await ensure("customers", "Clínica Sorriso Paulista", {
  tax_id: "12.345.678/0001-90",
  email: "compras@clinicasorriso.example",
  phone: "(11) 3456-7890",
  address: { city: "São Paulo", state: "SP", zip: "01310-100" },
});
const supplier = await ensure("suppliers", "Refrigeração Brasil Ltda.", {
  tax_id: "45.678.901/0001-22",
  email: "vendas@refrigeracaobrasil.example",
  phone: "(11) 4002-8922",
  address: { city: "Guarulhos", state: "SP", zip: "07024-010" },
});
const service = await ensure(
  "catalog_items",
  "Manutenção preventiva de ar-condicionado",
  {
    kind: "service",
    description: "Limpeza, higienização e revisão elétrica completa",
    unit: "un",
    unit_price: 180,
  },
);
const product = await ensure(
  "catalog_items",
  "Filtro de ar condicionado split",
  {
    kind: "product",
    description: "Filtro lavável compatível com equipamento split",
    unit: "un",
    unit_price: 68.5,
  },
);
async function ensureDoc(type, party) {
  const field = type === "quote" ? "customer_id" : "supplier_id";
  const { data: found } = await client
    .from("documents")
    .select("id")
    .eq("type", type)
    .eq(field, party.id)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (found) return found;
  const { data: number, error: numberError } = await client.rpc(
    "next_document_number",
    { org_id: org, doc_type: type },
  );
  if (numberError) throw numberError;
  const { data: doc, error } = await client
    .from("documents")
    .insert({
      organization_id: org,
      request_id: crypto.randomUUID(),
      type,
      number,
      status: "confirmed",
      [field]: party.id,
      counterparty_snapshot: party,
      subtotal: type === "quote" ? 2297 : 1370,
      discount: type === "quote" ? 80 : 0,
      shipping: type === "quote" ? 0 : 65,
      total: type === "quote" ? 2217 : 1435,
      commercial_terms: {
        validity: "2026-08-15",
        deadline: "5 dias úteis",
        paymentTerms: "50% na aprovação e 50% na conclusão",
        deliveryAddress: "Av. Paulista, 1000, São Paulo - SP",
      },
      notes:
        "Valores incluem mão de obra especializada e descarte responsável de resíduos.",
      issued_by: user.id,
      confirmed_by: user.id,
      confirmed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  const items =
    type === "quote"
      ? [
          {
            catalog_item_id: service.id,
            description: service.name,
            quantity: 12,
            unit: "un",
            unit_price: 180,
            discount: 80,
            line_total: 2080,
          },
          {
            catalog_item_id: product.id,
            description: product.name,
            quantity: 2,
            unit: "un",
            unit_price: 68.5,
            discount: 0,
            line_total: 137,
          },
        ]
      : [
          {
            catalog_item_id: product.id,
            description: product.name,
            quantity: 20,
            unit: "un",
            unit_price: 68.5,
            discount: 0,
            line_total: 1370,
          },
        ];
  const { error: itemError } = await client
    .from("document_items")
    .insert(
      items.map((i, index) => ({
        ...i,
        organization_id: org,
        document_id: doc.id,
        position: index + 1,
      })),
    );
  if (itemError) throw itemError;
  await client.from("document_events").insert([
    {
      organization_id: org,
      document_id: doc.id,
      event_type: "draft.created",
      actor_id: user.id,
    },
    {
      organization_id: org,
      document_id: doc.id,
      event_type: "document.confirmed",
      actor_id: user.id,
    },
  ]);
  return doc;
}
await ensureDoc("quote", customer);
await ensureDoc("purchase_order", supplier);
console.log(
  JSON.stringify({
    seeded: true,
    customers: 1,
    suppliers: 1,
    catalogItems: 2,
    documents: 2,
  }),
);
