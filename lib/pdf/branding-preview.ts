import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { brandingPalette, defaultBrandingSnapshot, type DocumentTemplateId } from "@/lib/branding/identity";
import { generateDocumentPdf } from "./generate";

export async function generateBrandingPreviewPdf(supabase: SupabaseClient, input: { organizationId: string; previewKey: string; templateId: DocumentTemplateId; primaryColor: string; logoStoragePath?: string | null }) {
  const { data: organization } = await supabase.from("organizations").select("name").eq("id", input.organizationId).single();
  let logoBytes: Uint8Array | undefined;
  if (input.logoStoragePath) {
    const logo = await supabase.storage.from("organization-assets").download(input.logoStoragePath);
    if (!logo.error) logoBytes = new Uint8Array(await logo.data.arrayBuffer());
  }
  const palette = brandingPalette(input.primaryColor);
  const branding = { ...defaultBrandingSnapshot(), templateId: input.templateId, primaryColor: palette.primary,
    contrastColor: palette.contrast, lightVariant: palette.light, darkVariant: palette.dark,
    logoStoragePath: input.logoStoragePath ?? null };
  const bytes = await generateDocumentPdf({ type: "quote", counterpartyName: "Cliente demonstrativo",
    items: [{ description: "Serviço demonstrativo", quantity: 2, unit: "un", unitPrice: 500, discount: 0 }], shipping: 0,
    deadline: "10 dias", paymentTerms: "50% de entrada", validity: "2027-12-31", notes: "Dados fictícios para demonstração." },
  { organizationName: organization?.name ?? "Sua empresa", number: "PRÉVIA", issuerName: "Responsável demonstrativo",
    validationCode: "DEMONSTRAÇÃO", branding, logoBytes, demonstration: true });
  const safeKey = input.previewKey.replace(/[^a-zA-Z0-9_-]/g, "").slice(-80);
  const path = `${input.organizationId}/document-branding/previews/${safeKey}.pdf`;
  const uploaded = await supabase.storage.from("documents").upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (uploaded.error) throw new Error("BRANDING_PREVIEW_STORAGE_FAILED");
  const signed = await supabase.storage.from("documents").createSignedUrl(path, 900);
  if (signed.error || !signed.data?.signedUrl) throw new Error("BRANDING_PREVIEW_SIGNED_URL_FAILED");
  return { url: signed.data.signedUrl, filename: "previa-identidade-visual.pdf" };
}
