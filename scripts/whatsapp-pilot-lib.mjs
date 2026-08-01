export const PILOT_AUTHORIZATION = "AUTORIZO_PILOTO_WHATSAPP_EMBER";

export const PILOT_STEPS = [
  "consult_new_phone",
  "verify_webhook_get",
  "receive_real_text",
  "verify_post_signature",
  "verify_organization_channel",
  "verify_queue_and_lock",
  "send_lume_text_reply",
  "observe_delivery_statuses",
  "deduplicate_message",
  "receive_and_transcribe_audio",
  "correct_conversation_data",
  "confirm_with_button",
  "create_quote",
  "create_purchase_order",
  "generate_and_send_pdf",
  "cancel_conversation",
  "request_human_handoff",
  "verify_tenant_isolation",
  "recover_after_restart",
  "rollback_previous_channel",
];

export function assertPilotAuthorized(value) {
  if (value !== PILOT_AUTHORIZATION) throw new Error("PILOT_EXPLICIT_AUTHORIZATION_REQUIRED");
  return true;
}
