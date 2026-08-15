import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  contentBriefingSchema,
  generatedContentSchema,
  imageBriefingSchema,
  imageSize,
  moderateContentInput,
} from "./domain";
export interface ContentProvider {
  generateText(
    briefing: unknown,
    brand?: unknown,
  ): Promise<{ content: unknown; model: string; usage?: unknown }>;
  generateImage(
    briefing: unknown,
  ): Promise<{
    bytes: Uint8Array;
    mimeType: string;
    model: string;
    width: number;
    height: number;
    usage?: unknown;
  }>;
}
export class OpenAIContentProvider implements ContentProvider {
  private client: OpenAI;
  constructor(apiKey = process.env.OPENAI_API_KEY) {
    if (!apiKey) throw new Error("OPENAI_API_KEY_MISSING");
    this.client = new OpenAI({
      apiKey,
      timeout: Math.min(
        Math.max(Number(process.env.OPENAI_TIMEOUT_MS) || 30000, 5000),
        60000,
      ),
      maxRetries: 1,
    });
  }
  async generateText(raw: unknown, brand: unknown = {}) {
    const briefing = contentBriefingSchema.parse(raw),
      model = process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini";
    if (!moderateContentInput(JSON.stringify(briefing)).allowed)
      throw new Error("CONTENT_MODERATION_BLOCKED");
    const response = await this.client.responses.parse({
      model,
      store: false,
      instructions:
        "Você é a Lume, assistente de conteúdo para pequenos negócios. Use somente dados do briefing e da marca. Não invente preço, desconto, urgência, resultado, alcance ou publicação. Português brasileiro, profissional e objetivo. Hashtags moderadas.",
      input: `Marca: ${JSON.stringify(brand)}\nBriefing: ${JSON.stringify(briefing)}`,
      text: { format: zodTextFormat(generatedContentSchema, "lume_content") },
      max_output_tokens: 1800,
    });
    if (!response.output_parsed) throw new Error("CONTENT_INVALID_OUTPUT");
    return {
      content: generatedContentSchema.parse(response.output_parsed),
      model,
      usage: response.usage,
    };
  }
  async generateImage(raw: unknown) {
    const briefing = imageBriefingSchema.parse(raw),
      model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
    if (!moderateContentInput(JSON.stringify(briefing)).allowed)
      throw new Error("CONTENT_MODERATION_BLOCKED");
    const size = imageSize(briefing.format),
      response = await this.client.images.generate({
        model,
        prompt: `Crie uma composição visual ${briefing.style} para uma empresa. Assunto: ${briefing.subject}. Objetivo: ${briefing.objective}. Público: ${briefing.audience}. Cores: ${briefing.colors.join(", ")}. Não inclua logotipo nem texto longo. Não invente marcas.`,
        size: size as "1024x1024" | "1024x1536" | "1536x1024",
        quality: "medium",
        output_format: "png",
      });
    const encoded = response.data?.[0]?.b64_json;
    if (!encoded) throw new Error("IMAGE_EMPTY_RESULT");
    const [width, height] = size.split("x").map(Number);
    return {
      bytes: new Uint8Array(Buffer.from(encoded, "base64")),
      mimeType: "image/png",
      model,
      width,
      height,
      usage: response.usage,
    };
  }
}
