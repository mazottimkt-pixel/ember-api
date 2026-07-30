import { aiExtractionSchema, type AIExtraction } from "@/lib/domain/schemas";
import { missingFields } from "@/lib/domain/missing-fields";

export interface AIProvider { extract(input: string): Promise<unknown>; transcribe(audio: ArrayBuffer, mimeType: string): Promise<string>; }
export class MockAIProvider implements AIProvider {
  async extract(input: string): Promise<unknown> { return { confidence: 0.5, ambiguities: [], notes: input }; }
  async transcribe(): Promise<string> { throw new Error("Transcrição mockada: configure OPENAI_API_KEY"); }
}
export async function extractValidated(provider: AIProvider, input: string): Promise<{ data: AIExtraction; missing: string[] }> {
  const data = aiExtractionSchema.parse(await provider.extract(input));
  return { data, missing: missingFields(data) };
}
export function confirmationSummary(data: AIExtraction) {
  return `Revise os dados de ${data.type === "purchase_order" ? "pedido de compra" : "orçamento"} para ${data.counterpartyName ?? "destinatário não informado"}. O documento só será finalizado após sua confirmação explícita.`;
}
