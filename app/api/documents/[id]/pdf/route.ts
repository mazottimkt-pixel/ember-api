import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateDocumentPdf } from "@/lib/pdf/generate";
const response = (bytes: ArrayBuffer | Uint8Array, number: string) =>
  new Response(
    bytes instanceof Uint8Array
      ? Buffer.from(bytes)
      : Buffer.from(new Uint8Array(bytes)),
    {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename=${number}.pdf`,
        "cache-control": "private, no-store",
      },
    },
  );
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params,
    supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { data: doc, error } = await supabase
    .from("documents")
    .select(
      "*,organizations(name,legal_name,tax_id,phone,email,address,logo_path),profiles!documents_issued_by_fkey(full_name,email,job_title),document_items(*)",
    )
    .eq("id", id)
    .single();
  if (error || !doc)
    return NextResponse.json(
      { error: "Documento não encontrado" },
      { status: 404 },
    );
  if (doc.status === "draft" || !doc.confirmed_at)
    return NextResponse.json(
      { error: "Confirmação explícita obrigatória" },
      { status: 409 },
    );
  const terms = doc.commercial_terms as {
    validity?: string;
    deadline?: string;
    paymentTerms?: string;
    deliveryAddress?: string;
  };
  const party = doc.counterparty_snapshot as Record<string, unknown>;
  const organization = doc.organizations as {
    name?: string;
    legal_name?: string;
    tax_id?: string;
    phone?: string;
    email?: string;
    address?: Record<string, string>;
    logo_path?: string;
  };
  let logoBytes: Uint8Array | undefined;
  if (organization?.logo_path) {
    const logo = await supabase.storage
      .from("organization-assets")
      .download(organization.logo_path);
    if (!logo.error) logoBytes = new Uint8Array(await logo.data.arrayBuffer());
  }
  const input = {
    type: doc.type,
    counterpartyName: String(party.name ?? party.legal_name ?? "Destinatário"),
    items: doc.document_items.map(
      (i: {
        description: string;
        quantity: number;
        unit: string;
        unit_price: number;
        discount: number;
      }) => ({
        description: i.description,
        quantity: Number(i.quantity),
        unit: i.unit,
        unitPrice: Number(i.unit_price),
        discount: Number(i.discount),
      }),
    ),
    shipping: Number(doc.shipping),
    validity: terms.validity || undefined,
    deadline: terms.deadline ?? "Não informado",
    paymentTerms: terms.paymentTerms ?? "Não informado",
    deliveryAddress:
      doc.type === "purchase_order"
        ? (terms.deliveryAddress ?? "A definir")
        : undefined,
    notes: doc.notes ?? undefined,
  };
  const bytes = await generateDocumentPdf(input, {
    organizationName: organization?.name ?? "Empresa",
    number: doc.number,
    issuerName:
      (doc.profiles as { full_name?: string })?.full_name ?? "Responsável",
    issuerEmail: (doc.profiles as { email?: string })?.email,
    issuerJobTitle: (doc.profiles as { job_title?: string })?.job_title,
    organizationDetails: [
      organization.legal_name,
      organization.tax_id && `CPF/CNPJ: ${organization.tax_id}`,
      organization.email,
      organization.phone,
      organization.address &&
        [
          organization.address.street,
          organization.address.number,
          organization.address.city,
          organization.address.state,
        ]
          .filter(Boolean)
          .join(", "),
    ].filter(Boolean) as string[],
    counterpartyDetails: [
      party.tax_id && `CPF/CNPJ: ${String(party.tax_id)}`,
      party.email && String(party.email),
      party.phone && String(party.phone),
    ].filter(Boolean) as string[],
    validationCode: doc.validation_code,
    logoBytes,
  });
  const path = `${doc.organization_id}/${doc.id}/documento.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (uploadError)
    return NextResponse.json(
      { error: "Falha ao armazenar PDF" },
      { status: 500 },
    );
  await supabase.from("files").insert({
    organization_id: doc.organization_id,
    document_id: doc.id,
    storage_path: path,
    mime_type: "application/pdf",
    size_bytes: bytes.length,
  });
  await supabase.from("document_events").insert({
    organization_id: doc.organization_id,
    document_id: doc.id,
    event_type: "pdf.generated",
    actor_id: user.id,
  });
  await supabase
    .from("documents")
    .update({ status: "generated" })
    .eq("id", doc.id)
    .eq("organization_id", doc.organization_id);
  return response(bytes, doc.number);
}
