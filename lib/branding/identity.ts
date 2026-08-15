import { z } from "zod";

export const DOCUMENT_TEMPLATE_IDS = ["essential", "executive", "contemporary", "commercial"] as const;
export type DocumentTemplateId = typeof DOCUMENT_TEMPLATE_IDS[number];
export type BrandingStatus = "not_configured" | "skipped_for_now" | "configured" | "default" | "disabled";

export const templateNames: Record<DocumentTemplateId, string> = {
  essential: "Essencial", executive: "Executivo", contemporary: "Contemporâneo", commercial: "Comercial",
};

export const DEFAULT_BRANDING = {
  status: "not_configured" as BrandingStatus,
  templateId: "executive" as DocumentTemplateId,
  primaryColor: "#334155",
  contrastColor: "#FFFFFF",
  lightVariant: "#F1F5F9",
  darkVariant: "#1E293B",
  version: 0,
  logoStoragePath: null as string | null,
};

const namedColors: Record<string, string> = {
  azul: "#2563EB", verde: "#15803D", vermelho: "#B91C1C", roxo: "#7E22CE",
  laranja: "#C2410C", amarelo: "#A16207", preto: "#111827", cinza: "#475569",
  rosa: "#BE185D", marrom: "#78350F", turquesa: "#0F766E",
};

export function normalizeBrandColor(value: string) {
  const normalizedName = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const candidate = namedColors[normalizedName] ?? (value.trim().startsWith("#") ? value.trim() : `#${value.trim()}`);
  if (!/^#[0-9a-f]{6}$/i.test(candidate)) throw new Error("BRANDING_COLOR_INVALID");
  return candidate.toUpperCase();
}

const channels = (hex: string) => [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
const toLinear = (value: number) => {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
};
export function relativeLuminance(hex: string) {
  const [r, g, b] = channels(normalizeBrandColor(hex)).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(one: string, two: string) {
  const [light, dark] = [relativeLuminance(one), relativeLuminance(two)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}
export function readableTextColor(background: string) {
  return contrastRatio(background, "#FFFFFF") >= contrastRatio(background, "#111827") ? "#FFFFFF" : "#111827";
}
const mix = (hex: string, target: number, amount: number) => {
  const result = channels(normalizeBrandColor(hex)).map((value) => Math.round(value + (target - value) * amount));
  return `#${result.map((value) => value.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
};
export function brandingPalette(primaryInput: string) {
  const primary = normalizeBrandColor(primaryInput);
  return { primary, contrast: readableTextColor(primary), light: mix(primary, 255, 0.9), dark: mix(primary, 0, 0.35) };
}

export const brandingSnapshotSchema = z.object({
  versionId: z.string().uuid().nullable().default(null), version: z.number().int().nonnegative(),
  templateId: z.enum(DOCUMENT_TEMPLATE_IDS), primaryColor: z.string().regex(/^#[0-9A-F]{6}$/),
  contrastColor: z.string().regex(/^#[0-9A-F]{6}$/), lightVariant: z.string().regex(/^#[0-9A-F]{6}$/),
  darkVariant: z.string().regex(/^#[0-9A-F]{6}$/), logoStoragePath: z.string().nullable(),
  logoMimeType: z.enum(["image/png", "image/jpeg"]).nullable().default(null),
});
export type BrandingSnapshot = z.infer<typeof brandingSnapshotSchema>;

export function defaultBrandingSnapshot(): BrandingSnapshot {
  return { versionId: null, version: 0, templateId: DEFAULT_BRANDING.templateId, primaryColor: DEFAULT_BRANDING.primaryColor,
    contrastColor: DEFAULT_BRANDING.contrastColor, lightVariant: DEFAULT_BRANDING.lightVariant,
    darkVariant: DEFAULT_BRANDING.darkVariant, logoStoragePath: null, logoMimeType: null };
}

export function brandingSnapshot(row?: Record<string, unknown> | null): BrandingSnapshot {
  if (!row) return defaultBrandingSnapshot();
  return brandingSnapshotSchema.parse({ versionId: row.id ?? null, version: row.version ?? 0,
    templateId: row.template_id ?? DEFAULT_BRANDING.templateId, primaryColor: row.primary_color ?? DEFAULT_BRANDING.primaryColor,
    contrastColor: row.contrast_color ?? DEFAULT_BRANDING.contrastColor, lightVariant: row.light_variant ?? DEFAULT_BRANDING.lightVariant,
    darkVariant: row.dark_variant ?? DEFAULT_BRANDING.darkVariant, logoStoragePath: row.logo_storage_path ?? null,
    logoMimeType: row.logo_mime_type ?? null });
}

export function shouldOfferBranding(status: BrandingStatus | null | undefined) {
  return !status || status === "not_configured";
}
