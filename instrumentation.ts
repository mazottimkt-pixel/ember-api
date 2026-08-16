export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.LUME_CONVERSATION_V2_SHADOW === "true" &&
    process.env.LUME_CONVERSATION_V2_PERSIST_SHADOW === "true" &&
    process.env.LUME_CONVERSATION_V2_RECOVERY_ENABLED === "true"
  ) {
    const { startConversationV2RecoveryRunner } =
      await import("./lib/conversation-v2/recovery-runner");
    startConversationV2RecoveryRunner();
  }
}
