import "server-only";
import OpenAI, { toFile } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { agentDecisionSchema, emptyAgentDraft, type AgentDecision, type AgentDraft } from "./contracts";
import type { AgentAIProvider } from "./provider";

const instructions = `Você é o agente comercial do Ember Comercial. Fale em português brasileiro, de modo formal, cordial e objetivo. Use frases claras e curtas. Faça somente uma pergunta por vez. Extraia exclusivamente dados informados pelo usuário e preserve os dados válidos do rascunho atual. Nunca invente dados. Confirme valores e datas. Não dê parecer jurídico ou fiscal. Informe quando precisar de intervenção humana. Um documento definitivo sempre exige confirmação explícita e validação do servidor.`;

export class OpenAIProvider implements AgentAIProvider {
  readonly name = "openai";
  private readonly client: OpenAI;

  constructor(apiKey = process.env.OPENAI_API_KEY) {
    if (!apiKey) throw new Error("OPENAI_API_KEY_MISSING");
    const timeout = Math.min(Math.max(Number(process.env.OPENAI_TIMEOUT_MS) || 20_000, 5_000), 60_000);
    this.client = new OpenAI({ apiKey, timeout, maxRetries: 2 });
  }

  async analyze(input: string, current: AgentDraft): Promise<AgentDecision> {
    const response = await this.client.responses.parse({
      model: process.env.OPENAI_TEXT_MODEL || "gpt-5.6-sol",
      instructions,
      input: `Rascunho atual:\n${JSON.stringify(current)}\n\nMensagem do usuário:\n${input}`,
      max_output_tokens: Math.min(Math.max(Number(process.env.OPENAI_MAX_OUTPUT_TOKENS) || 1200, 300), 3000),
      store: false,
      text: { format: zodTextFormat(agentDecisionSchema, "ember_agent_decision") },
    });
    if (!response.output_parsed) throw new Error("OPENAI_INVALID_OUTPUT");
    return agentDecisionSchema.parse(response.output_parsed);
  }

  async transcribe(audio: File): Promise<string> {
    const file = await toFile(Buffer.from(await audio.arrayBuffer()), audio.name || "audio.webm", { type: audio.type });
    const result = await this.client.audio.transcriptions.create({
      file,
      model: process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe",
      language: "pt",
      response_format: "json",
    });
    return result.text.trim();
  }
}

class FallbackProvider implements AgentAIProvider {
  readonly name = "fallback";
  async analyze(input: string, current = emptyAgentDraft()): Promise<AgentDecision> {
    const lower = input.toLocaleLowerCase("pt-BR");
    const type = lower.includes("pedido") || lower.includes("compra") ? "purchase_order"
      : lower.includes("orçamento") || lower.includes("orcamento") ? "quote"
      : lower.includes("consult") ? "document_search" : current.type;
    return agentDecisionSchema.parse({
      intent: type ?? "unknown",
      draft: { ...current, type },
      ambiguities: [],
      reply: type ? "Entendi. Vou reunir os dados necessários, um campo por vez." : "O que você deseja criar hoje: orçamento, pedido de compra ou consulta de documentos?",
    });
  }
  async transcribe(): Promise<string> { throw new Error("AI_UNAVAILABLE"); }
}

export function getAgentAIProvider(): AgentAIProvider {
  return process.env.OPENAI_API_KEY ? new OpenAIProvider() : new FallbackProvider();
}
