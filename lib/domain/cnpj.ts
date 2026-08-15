const digitsOnly = (value: string) => value.replace(/\D/g, "");

export function isValidCnpj(value: string) {
  const digits = digitsOnly(value);
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const check = (length: 12 | 13) => {
    let factor = length - 7;
    let total = 0;
    for (let index = 0; index < length; index += 1) {
      total += Number(digits[index]) * factor--;
      if (factor < 2) factor = 9;
    }
    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return check(12) === Number(digits[12]) && check(13) === Number(digits[13]);
}

export function normalizeCnpj(value: string) {
  const digits = digitsOnly(value);
  if (!isValidCnpj(digits)) throw new Error("INVALID_CNPJ");
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

export function extractCnpj(value: string) {
  const candidate = value.match(/\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}/)?.[0];
  if (!candidate) return undefined;
  return normalizeCnpj(candidate);
}
