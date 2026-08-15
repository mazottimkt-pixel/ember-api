const BRAZIL_COUNTRY_CODE = "55";

/**
 * Normaliza destinatários brasileiros da Cloud API sem inferir DDI.
 * A Meta pode omitir o nono dígito no identificador do remetente, por isso
 * números móveis brasileiros de 12 dígitos são convertidos para 13 dígitos.
 */
export function normalizeWhatsAppRecipient(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits.startsWith(BRAZIL_COUNTRY_CODE)) return null;

  if (/^55[1-9]\d[6-9]\d{7}$/.test(digits))
    return `${digits.slice(0, 4)}9${digits.slice(4)}`;

  if (/^55[1-9]\d9\d{8}$/.test(digits)) return digits;

  return null;
}

export function isAuthorizedWhatsAppRecipient(
  recipient: string | null | undefined,
  allowedRecipient: string | null | undefined,
) {
  const normalizedRecipient = normalizeWhatsAppRecipient(recipient);
  const normalizedAllowed = normalizeWhatsAppRecipient(allowedRecipient);
  return Boolean(
    normalizedRecipient &&
      normalizedAllowed &&
      normalizedRecipient === normalizedAllowed,
  );
}
