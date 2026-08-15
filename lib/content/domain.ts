import { createHash } from "node:crypto";
import { z } from "zod";
export const contentTypes = [
  "instagram_post",
  "caption",
  "reels",
  "stories",
  "campaign",
  "ideas",
  "calendar",
  "image",
  "package",
] as const;
export const contentStatuses = [
  "draft",
  "generating",
  "ready_for_review",
  "approved",
  "archived",
  "failed",
  "cancelled",
] as const;
export const brandProfileSchema = z.object({
  segment: z.string().trim().min(2).max(160),
  audience: z.string().trim().min(2).max(500),
  voiceTone: z
    .enum([
      "professional",
      "friendly",
      "modern",
      "sophisticated",
      "direct",
      "custom",
    ])
    .default("professional"),
  preferredWords: z.array(z.string().max(80)).max(50).default([]),
  forbiddenWords: z.array(z.string().max(80)).max(50).default([]),
  defaultCta: z.string().max(240).optional(),
  colors: z
    .array(z.string().regex(/^#[0-9a-f]{6}$/i))
    .max(6)
    .default([]),
  visualStyle: z.string().max(160).optional(),
  primaryGoal: z.string().max(300).optional(),
  networks: z.array(z.string().max(40)).max(10).default([]),
  notes: z.string().max(1000).optional(),
});
export const contentBriefingSchema = z.object({
  type: z.enum(contentTypes),
  objective: z.string().trim().min(3).max(500),
  subject: z.string().trim().min(3).max(1000),
  audience: z.string().trim().min(2).max(500),
  tone: z.string().trim().min(2).max(100),
  offer: z.string().trim().max(500).optional(),
  price: z.string().trim().max(100).optional(),
  deadline: z.string().trim().max(100).optional(),
  length: z.enum(["short", "medium", "detailed"]).optional(),
  duration: z.enum(["15", "30", "45", "60"]).optional(),
  storyCount: z.enum(["1", "3", "5"]).optional(),
  calendarDays: z.enum(["7", "15", "30"]).optional(),
  requestId: z.uuid(),
});
export const generatedContentSchema = z.object({
  title: z.string().max(200),
  body: z.string().max(6000),
  caption: z.string().max(4000).optional(),
  cta: z.string().max(300),
  hashtags: z.array(z.string().max(80)).max(12).default([]),
  visualGuidance: z.string().max(2000).optional(),
  scenes: z
    .array(
      z.object({
        scene: z.string().max(500),
        speech: z.string().max(1000).optional(),
        screenText: z.string().max(300).optional(),
      }),
    )
    .max(20)
    .optional(),
});
export const imageBriefingSchema = z.object({
  objective: z.string().min(3).max(500),
  subject: z.string().min(3).max(1000),
  format: z.enum(["square", "vertical", "story", "reels_cover", "horizontal"]),
  style: z.enum([
    "professional",
    "modern",
    "minimalist",
    "sophisticated",
    "vibrant",
    "promotional",
    "photographic",
    "illustrated",
    "custom",
  ]),
  colors: z.array(z.string().max(30)).max(6).default([]),
  shortTitle: z.string().max(60).optional(),
  subtitle: z.string().max(100).optional(),
  cta: z.string().max(40).optional(),
  audience: z.string().max(500),
  restrictions: z.string().max(1000).optional(),
  requestId: z.uuid(),
});
export function briefingHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function moderateContentInput(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const blocked = [
    /pornografia infantil/,
    /falsificar (?:documento|assinatura)/,
    /fraude bancaria/,
    /violencia grafica/,
    /se passar por/,
  ];
  return {
    allowed: !blocked.some((rule) => rule.test(normalized)),
    result: blocked.some((rule) => rule.test(normalized))
      ? "blocked"
      : ("allowed" as const),
  };
}
export function imageSize(
  format: z.infer<typeof imageBriefingSchema>["format"],
) {
  return format === "square"
    ? "1024x1024"
    : format === "horizontal"
      ? "1536x1024"
      : "1024x1536";
}
