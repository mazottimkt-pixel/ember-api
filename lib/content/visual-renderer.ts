import { z } from "zod";

export const socialFormats = {
  square: { width: 1080, height: 1080, titleMax: 56, subtitleMax: 100, ctaMax: 32 },
  vertical: { width: 1080, height: 1350, titleMax: 64, subtitleMax: 120, ctaMax: 32 },
  story: { width: 1080, height: 1920, titleMax: 64, subtitleMax: 120, ctaMax: 32 },
  reels_cover: { width: 1080, height: 1920, titleMax: 56, subtitleMax: 100, ctaMax: 28 },
  horizontal: { width: 1200, height: 628, titleMax: 48, subtitleMax: 90, ctaMax: 28 },
} as const;
export const visualTemplates = ["minimal", "promotional", "editorial"] as const;
export type SocialFormat = keyof typeof socialFormats;

const inputSchema = z.object({
  format: z.enum(["square", "vertical", "story", "reels_cover", "horizontal"]),
  template: z.enum(visualTemplates),
  primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  title: z.string(),
  subtitle: z.string().optional(),
  cta: z.string().optional(),
  baseImageDataUrl: z.string().startsWith("data:image/").optional(),
  logoDataUrl: z.string().startsWith("data:image/").optional(),
});
export type VisualComposition = z.infer<typeof inputSchema>;

export function relativeLuminance(hex: string) {
  const values = hex.slice(1).match(/.{2}/g)!.map((v) => parseInt(v, 16) / 255);
  const linear = values.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}
export function readableTextColor(background: string) {
  const l = relativeLuminance(background);
  const white = 1.05 / (l + 0.05), black = (l + 0.05) / 0.05;
  return white >= black ? "#ffffff" : "#111827";
}
const escape = (s: string) => s.replace(/[&<>"']/g, (v) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[v]!));
const assertText = (value: string | undefined, max: number, field: string) => {
  if (value && value.length > max) throw new Error(`VISUAL_${field.toUpperCase()}_TOO_LONG`);
};
export function renderSocialSvg(raw: VisualComposition) {
  const input = inputSchema.parse(raw), f = socialFormats[input.format];
  assertText(input.title, f.titleMax, "title");
  assertText(input.subtitle, f.subtitleMax, "subtitle");
  assertText(input.cta, f.ctaMax, "cta");
  const foreground = readableTextColor(input.primaryColor), margin = Math.round(f.width * 0.075);
  const image = input.baseImageDataUrl ? `<image href="${escape(input.baseImageDataUrl)}" width="${f.width}" height="${f.height}" preserveAspectRatio="xMidYMid slice"/>` : "";
  const overlayOpacity = input.template === "minimal" ? .82 : input.template === "promotional" ? .72 : .62;
  const titleY = input.template === "editorial" ? Math.round(f.height * .62) : Math.round(f.height * .55);
  const logo = input.logoDataUrl ? `<rect x="${margin}" y="${margin}" width="180" height="100" rx="14" fill="#fff" fill-opacity=".92"/><image href="${escape(input.logoDataUrl)}" x="${margin + 12}" y="${margin + 12}" width="156" height="76" preserveAspectRatio="xMidYMid meet"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f.width}" height="${f.height}" viewBox="0 0 ${f.width} ${f.height}"><rect width="100%" height="100%" fill="${input.primaryColor}"/>${image}<rect width="100%" height="100%" fill="${input.primaryColor}" fill-opacity="${overlayOpacity}"/>${logo}<g fill="${foreground}" font-family="Arial,Helvetica,sans-serif"><text x="${margin}" y="${titleY}" font-size="${Math.round(f.width * .072)}" font-weight="700">${escape(input.title)}</text>${input.subtitle ? `<text x="${margin}" y="${titleY + Math.round(f.width*.09)}" font-size="${Math.round(f.width*.034)}">${escape(input.subtitle)}</text>` : ""}${input.cta ? `<rect x="${margin}" y="${titleY + Math.round(f.width*.15)}" width="${Math.min(f.width-margin*2, input.cta.length*24+72)}" height="70" rx="35" fill="${foreground}"/><text x="${margin+36}" y="${titleY + Math.round(f.width*.15)+46}" font-size="28" font-weight="700" fill="${input.primaryColor}">${escape(input.cta)}</text>` : ""}</g></svg>`;
}
