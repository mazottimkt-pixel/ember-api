export function digits(value: string) {
  return value.replace(/\D/g, "");
}

export function isValidCpf(value: string) {
  const cpf = digits(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const check = (length: number) => {
    const sum = cpf
      .slice(0, length)
      .split("")
      .reduce(
        (total, digit, index) => total + Number(digit) * (length + 1 - index),
        0,
      );
    const rest = (sum * 10) % 11;
    return Number(cpf[length]) === (rest === 10 ? 0 : rest);
  };
  return check(9) && check(10);
}

export function isValidCnpj(value: string) {
  const cnpj = digits(value);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const calculate = (base: string, weights: number[]) => {
    const sum = base
      .split("")
      .reduce(
        (total, digit, index) => total + Number(digit) * weights[index],
        0,
      );
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const first = calculate(
    cnpj.slice(0, 12),
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  const second = calculate(
    cnpj.slice(0, 12) + first,
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  return cnpj.endsWith(`${first}${second}`);
}

export function isValidTaxId(value: string) {
  const normalized = digits(value);
  return normalized.length === 11
    ? isValidCpf(normalized)
    : normalized.length === 14 && isValidCnpj(normalized);
}

export function formatDateBR(value?: string | null) {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}
