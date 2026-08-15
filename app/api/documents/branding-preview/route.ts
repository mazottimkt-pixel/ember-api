import { z } from "zod";
import { requireMembership } from "@/lib/auth/session";
import { brandingPalette, defaultBrandingSnapshot, DOCUMENT_TEMPLATE_IDS } from "@/lib/branding/identity";
import { generateDocumentPdf } from "@/lib/pdf/generate";

const querySchema = z.object({ template: z.enum(DOCUMENT_TEMPLATE_IDS).default("executive"), color: z.string().default("#334155") });

export async function GET(request: Request) {
  const { supabase, organizationId } = await requireMembership();
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const query = querySchema.parse(params);
  const palette = brandingPalette(query.color);
  const [{ data: organization }, { data: active }] = await Promise.all([
    supabase.from("organizations").select("name,logo_path").eq("id", organizationId).single(),
    supabase.from("document_branding_versions").select("logo_storage_path,logo_mime_type").eq("organization_id", organizationId).eq("active", true).maybeSingle(),
  ]);
  const logoPath = active?.logo_storage_path ?? organization?.logo_path;
  let logoBytes: Uint8Array | undefined;
  if (logoPath) {
    const logo = await supabase.storage.from("organization-assets").download(logoPath);
    if (!logo.error) logoBytes = new Uint8Array(await logo.data.arrayBuffer());
  }
  const branding = { ...defaultBrandingSnapshot(), templateId: query.template, primaryColor: palette.primary,
    contrastColor: palette.contrast, lightVariant: palette.light, darkVariant: palette.dark,
    logoStoragePath: logoPath ?? null, logoMimeType: active?.logo_mime_type ?? null };
  const bytes = await generateDocumentPdf({ type: "quote", counterpartyName: "Cliente demonstrativo",
    items: [{ description: "Serviço demonstrativo", quantity: 2, unit: "un", unitPrice: 500, discount: 0 }],
    shipping: 0, deadline: "10 dias", paymentTerms: "50% de entrada", validity: "2027-08-10",
    notes: "Dados fictícios utilizados somente para visualizar o modelo." },
  { organizationName: organization?.name ?? "Sua empresa", number: "PRÉVIA", issuerName: "Responsável demonstrativo",
    validationCode: "DEMONSTRAÇÃO", branding, logoBytes, demonstration: true });
  return new Response(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": "inline; filename=previa-identidade.pdf", "cache-control": "no-store" } });
}
