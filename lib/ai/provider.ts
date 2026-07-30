import type { AgentDecision, AgentDraft } from "./contracts";

export interface AgentAIProvider {
  readonly name: string;
  analyze(input: string, current: AgentDraft): Promise<AgentDecision>;
  transcribe(audio: File): Promise<string>;
}
