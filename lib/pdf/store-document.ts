import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateDocumentPdf } from "./generate";
import { brandingSnapshot, defaultBrandingSnapshot } from "@/lib/branding/identity";

export function persistedDocumentPdfInput(doc:Record<string,unknown>){
  const party=doc.counterparty_snapshot as Record<string,unknown>,terms=doc.commercial_terms as Record<string,string|undefined>;
  return{type:doc.type as "quote"|"purchase_order",counterpartyName:String(party.name??party.legal_name??"Destinatário"),items:(doc.document_items as Array<Record<string,unknown>>).map(item=>({description:String(item.description),quantity:Number(item.quantity),unit:String(item.unit),unitPrice:Number(item.unit_price),discount:Number(item.discount)})),shipping:Number(doc.shipping),validity:terms.validity,deadline:terms.deadline??"Não informado",paymentTerms:terms.paymentTerms??"Não informado",deliveryAddress:doc.type==="purchase_order"?terms.deliveryAddress??"A definir":undefined,notes:doc.notes?String(doc.notes):undefined};
}

export async function generateStoredDocumentPdf(
  supabase: SupabaseClient,
  input: { organizationId: string; userId: string; documentId: string },
) {
  const { data: doc, error } = await supabase
    .from("documents")
    .select(
      "*,organizations(name,legal_name,tax_id,phone,email,address,logo_path),profiles!documents_issued_by_fkey(full_name,email,job_title),document_items(*)",
    )
    .eq("id", input.documentId)
    .eq("organization_id", input.organizationId)
    .single();
  if (error || !doc) throw new Error("PDF_DOCUMENT_NOT_FOUND");
  if (!doc.confirmed_at || !["confirmed", "generated", "sent"].includes(doc.status))
    throw new Error("PDF_EXPLICIT_CONFIRMATION_REQUIRED");

  const path = `${input.organizationId}/${doc.id}/documento.pdf`;
  const { data: existing } = await supabase
    .from("files")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("document_id", doc.id)
    .eq("storage_path", path)
    .is("deleted_at", null)
    .maybeSingle();

  if (!existing) {
    const organization = doc.organizations as Record<string, unknown>;
    const party = doc.counterparty_snapshot as Record<string, unknown>;
    const profile = doc.profiles as Record<string, string | undefined>;
    const visualIdentity = doc.branding_snapshot
      ? brandingSnapshot(doc.branding_snapshot as Record<string, unknown>)
      : defaultBrandingSnapshot();
    let logoBytes: Uint8Array | undefined;
    const logoPath = visualIdentity.logoStoragePath ?? (typeof organization.logo_path === "string" ? organization.logo_path : undefined);
    if (logoPath) {
      const logo = await supabase.storage
        .from("organization-assets")
        .download(logoPath);
      if (!logo.error) logoBytes = new Uint8Array(await logo.data.arrayBuffer());
    }
    const bytes = await generateDocumentPdf(
      persistedDocumentPdfInput(doc as Record<string,unknown>),
      {
        organizationName: String(organization.name ?? "Empresa"),
        number: doc.number,
        issuerName: profile.full_name ?? "Responsável",
        issuerEmail: profile.email,
        issuerJobTitle: profile.job_title,
        organizationDetails: [organization.legal_name, organization.tax_id, organization.email, organization.phone]
          .filter(Boolean)
          .map(String),
        counterpartyDetails: [party.document_number ?? party.tax_id, party.email, party.phone]
          .filter(Boolean)
          .map(String),
        validationCode: doc.validation_code,
        logoBytes,
        branding: visualIdentity,
      },
    );
    const uploaded = await supabase.storage
      .from("documents")
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (uploaded.error) throw new Error("PDF_STORAGE_FAILED");
    const file = await supabase.from("files").insert({
      organization_id: input.organizationId,
      document_id: doc.id,
      storage_path: path,
      mime_type: "application/pdf",
      size_bytes: bytes.length,
    });
    if (file.error) throw new Error("PDF_FILE_RECORD_FAILED");
    await supabase.from("document_events").insert({
      organization_id: input.organizationId,
      document_id: doc.id,
      event_type: "pdf.generated",
      actor_id: input.userId,
    });
  }

  await supabase
    .from("documents")
    .update({ status: "generated" })
    .eq("id", doc.id)
    .eq("organization_id", input.organizationId)
    .eq("status", "confirmed");

  const signed = await supabase.storage.from("documents").createSignedUrl(path, 3600);
  if (signed.error || !signed.data?.signedUrl) throw new Error("PDF_SIGNED_URL_FAILED");
  return { url: signed.data.signedUrl, filename: `${doc.number}.pdf` };
}
