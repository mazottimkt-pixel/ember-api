import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { brandingPalette, contrastRatio, defaultBrandingSnapshot, DOCUMENT_TEMPLATE_IDS, normalizeBrandColor, readableTextColor, shouldOfferBranding, templateNames } from "@/lib/branding/identity";
import { validateLogo } from "@/lib/branding/image";
import { generateDocumentPdf } from "@/lib/pdf/generate";

const png = (width = 200, height = 100, colorType = 6) => {
  const bytes = new Uint8Array(33); bytes.set([137,80,78,71,13,10,26,10]);
  const view = new DataView(bytes.buffer); view.setUint32(16, width); view.setUint32(20, height); bytes[25] = colorType;
  return new File([bytes], "logo.png", { type: "image/png" });
};
const jpeg = () => new File([new Uint8Array([0xff,0xd8,0xff,0xc0,0,11,8,0,100,0,200,3,1,0,2,0,3,0,0xff,0xd9])], "logo.jpg", { type: "image/jpeg" });

describe("identidade visual dos documentos", () => {
  it("usa Executivo neutro quando não há configuração", () => expect(defaultBrandingSnapshot()).toMatchObject({ templateId: "executive", primaryColor: "#334155", version: 0 }));
  it("oferece somente no primeiro uso", () => {
    expect(shouldOfferBranding("not_configured")).toBe(true);
    expect(shouldOfferBranding("skipped_for_now")).toBe(false);
    expect(shouldOfferBranding("configured")).toBe(false);
  });
  it.each([["1F3A5F", "#1F3A5F"], ["#1f3a5f", "#1F3A5F"], ["azul", "#2563EB"]])("normaliza a cor %s", (input, expected) => expect(normalizeBrandColor(input)).toBe(expected));
  it("rejeita cor inválida e cria paleta legível", () => {
    expect(() => normalizeBrandColor("talvez azul")).toThrow("BRANDING_COLOR_INVALID");
    const palette = brandingPalette("#FFFF00");
    expect(palette.contrast).toBe("#111827");
    expect(contrastRatio(palette.primary, palette.contrast)).toBeGreaterThan(4.5);
    expect(readableTextColor("#000000")).toBe("#FFFFFF");
  });
  it("valida PNG, transparência, tamanho pequeno e proporção extrema", async () => {
    await expect(validateLogo(png())).resolves.toMatchObject({ width: 200, height: 100, hasTransparency: true });
    await expect(validateLogo(png(40, 20))).resolves.toMatchObject({ small: true });
    await expect(validateLogo(png(1000, 50))).resolves.toMatchObject({ extremeAspectRatio: true });
  });
  it("valida JPEG pelo conteúdo", async () => await expect(validateLogo(jpeg())).resolves.toMatchObject({ width: 200, height: 100, mimeType: "image/jpeg" }));
  it("rejeita arquivo vazio, grande, MIME inválido e conteúdo corrompido", async () => {
    await expect(validateLogo(new File([], "x.png", { type: "image/png" }))).rejects.toThrow("BRANDING_LOGO_EMPTY");
    await expect(validateLogo(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "x.png", { type: "image/png" }))).rejects.toThrow("BRANDING_LOGO_TOO_LARGE");
    await expect(validateLogo(new File([new Uint8Array(10)], "x.svg", { type: "image/svg+xml" }))).rejects.toThrow("BRANDING_LOGO_TYPE_INVALID");
    await expect(validateLogo(new File([new Uint8Array(40)], "x.png", { type: "image/png" }))).rejects.toThrow("BRANDING_LOGO_CORRUPTED");
  });
  it.each(DOCUMENT_TEMPLATE_IDS)("gera prévia demonstrativa do modelo %s", async (templateId) => {
    const bytes = await generateDocumentPdf({ type: "quote", counterpartyName: "Cliente demonstrativo", items: [{ description: "Item", quantity: 1, unit: "un", unitPrice: 100, discount: 0 }], shipping: 0, deadline: "5 dias", paymentTerms: "À vista", validity: "2027-12-31" },
      { organizationName: "Empresa demonstrativa", number: "PRÉVIA", issuerName: "Responsável", validationCode: "DEMONSTRAÇÃO", demonstration: true,
        branding: { ...defaultBrandingSnapshot(), templateId } });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
    expect(templateNames[templateId]).toBeTruthy();
  });
  it("migration cria versionamento, snapshot, RLS e rollback", () => {
    const sql = readFileSync("supabase/migrations/202608040001_document_branding.sql", "utf8");
    const rollback = readFileSync("supabase/rollbacks/202608040001_document_branding.rollback.sql", "utf8");
    expect(sql).toContain("document_branding_versions"); expect(sql).toContain("branding_snapshot jsonb");
    expect(sql).toContain("enable row level security"); expect(sql).toContain("public.is_org_member(organization_id)");
    expect(sql).toContain("organization-assets"); expect(rollback).toContain("drop table if exists public.document_branding_versions");
  });
});
