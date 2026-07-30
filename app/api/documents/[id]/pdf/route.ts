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
      "*,organizations(name,logo_path),profiles!documents_issued_by_fkey(full_name),document_items(*)",
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
  const { data: existing } = await supabase
    .from("files")
    .select("storage_path")
    .eq("document_id", id)
    .eq("mime_type", "application/pdf")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    const downloaded = await supabase.storage
      .from("documents")
      .download(existing.storage_path);
    if (!downloaded.error)
      return response(await downloaded.data.arrayBuffer(), doc.number);
  }
  const terms = doc.commercial_terms as {
    validity?: string;
    deadline?: string;
    paymentTerms?: string;
    deliveryAddress?: string;
  };
  const party = doc.counterparty_snapshot as { name?: string };
  const organization = doc.organizations as {
    name?: string;
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
    counterpartyName: party.name ?? "Destinatário",
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
  await supabase
    .from("files")
    .insert({
      organization_id: doc.organization_id,
      document_id: doc.id,
      storage_path: path,
      mime_type: "application/pdf",
      size_bytes: bytes.length,
    });
  await supabase
    .from("document_events")
    .insert({
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
