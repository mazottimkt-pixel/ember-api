import type { AgentDraft, AgentState } from "@/lib/ai/contracts";
import type { AgentCollectionContext } from "@/lib/ai/validity";
import { isStandaloneGreeting } from "@/lib/navigation/session-policy";

export const FIRST_CONTACT_INTRODUCTION =
  "Olá! Eu sou a Lume, sua assistente de compras e gestão. ✨\n\n" +
  "Posso ajudar a criar e consultar orçamentos e pedidos de compra, encontrar clientes, fornecedores, produtos e serviços, organizar documentos e arquivos e acompanhar suas demandas por aqui.\n\n" +
  "Você pode falar comigo normalmente, como falaria com alguém da sua equipe.";

export const FIRST_CONTACT_INVITATION = "O que precisamos resolver hoje?";
export const RETURNING_USER_GREETING = "Olá! O que vamos resolver hoje?";
export const TASK_RESUMPTION_GREETING =
  "Olá! Podemos continuar de onde paramos ou resolver outra coisa.";

export function applyConversationExperience(input: {
  message: string;
  state: AgentState;
  draft: AgentDraft;
  collection: AgentCollectionContext;
  reply: string;
  now?: Date;
}) {
  const now = (input.now ?? new Date()).toISOString();
  const firstContact = !input.collection.experience?.introductionSeenAt;
  const greeting = isStandaloneGreeting(input.message);
  const activeTask =
    input.state === "collecting" ||
    input.state === "awaiting_confirmation" ||
    Boolean(input.draft.type);

  let reply = input.reply;
  if (firstContact) {
    reply = greeting
      ? `${FIRST_CONTACT_INTRODUCTION}\n\n${FIRST_CONTACT_INVITATION}`
      : `${FIRST_CONTACT_INTRODUCTION}\n\n${input.reply}`;
  } else if (greeting) {
    reply = activeTask ? TASK_RESUMPTION_GREETING : RETURNING_USER_GREETING;
  }

  return {
    reply,
    collection: {
      ...input.collection,
      experience: {
        introductionSeenAt:
          input.collection.experience?.introductionSeenAt ?? now,
        lastInteractionAt: now,
      },
    },
    firstContact,
  };
}
