export const SWITCH_CONFIRMATION = "CONFIRMAR TROCA DO CANAL";
export const ROLLBACK_CONFIRMATION = "CONFIRMAR RETORNO DO CANAL";

export function digits(value, name) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) throw new Error(`${name}_INVALID`);
  return normalized;
}

export function maskId(value) {
  const text = String(value ?? "");
  return text.length > 8 ? `${text.slice(0, 4)}***${text.slice(-4)}` : "***";
}

export function buildSwitchPlan(current, next) {
  if (!current?.id) throw new Error("CURRENT_CHANNEL_NOT_FOUND");
  return {
    operation: current.phoneNumberId === next.phoneNumberId ? "refresh" : "switch",
    currentPhone: maskId(current.phoneNumberId),
    nextPhone: maskId(next.phoneNumberId),
    currentWaba: maskId(current.businessAccountId),
    nextWaba: maskId(next.businessAccountId),
    rollbackAvailable: current.phoneNumberId !== next.phoneNumberId,
  };
}
