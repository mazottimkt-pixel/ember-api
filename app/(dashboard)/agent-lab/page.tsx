import { requireMembership } from "@/lib/auth/session";
import { AgentLab } from "@/components/agent-lab";

export default async function AgentLabPage() {
  await requireMembership();
  return <><div className="topline"><div><span className="eyebrow">LABORATÓRIO INTERNO</span><h1>Lume</h1><p className="muted">Assistente comercial inteligente da Ember. Teste texto e áudio antes de conectar qualquer canal externo.</p></div></div><AgentLab /></>;
}
