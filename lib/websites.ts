export type Website = {
  id: string | number;
  domain: string;
  status: string;
  price: string | null;
  category: string | null;
  owner: string | null;
  country: string | null;
  created_at: string | null;
  interested: number | null;
};

export type WebsiteFormState = {
  error: string;
  fieldErrors?: Partial<Record<WebsiteField, string>>;
};

export type WebsiteField =
  | "domain"
  | "status"
  | "price"
  | "category"
  | "owner"
  | "country"
  | "created_at"
  | "interested";

export const initialWebsiteFormState: WebsiteFormState = { error: "" };

const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function normalizeDomain(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").split(/[/?#]/)[0].replace(/^www\./, "").replace(/\.$/, "");
}

export function isValidDomain(value: string) {
  return DOMAIN_PATTERN.test(value);
}

export function parseWebsiteForm(formData: FormData):
  | { data: Omit<Website, "id"> }
  | { error: WebsiteFormState } {
  const domain = normalizeDomain(String(formData.get("domain") ?? ""));
  const status = String(formData.get("status") ?? "").trim();
  const price = String(formData.get("price") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const owner = String(formData.get("owner") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const createdAt = String(formData.get("created_at") ?? "").trim();
  const interestedRaw = String(formData.get("interested") ?? "0").trim();
  const interested = Number(interestedRaw);
  const fieldErrors: WebsiteFormState["fieldErrors"] = {};

  if (!domain) fieldErrors.domain = "Informe o domínio.";
  else if (!DOMAIN_PATTERN.test(domain)) fieldErrors.domain = "Informe um domínio válido, como exemplo.com.";
  if (!status) fieldErrors.status = "Informe o status.";
  else if (status.length > 100) fieldErrors.status = "Use no máximo 100 caracteres.";
  if (price.length > 100) fieldErrors.price = "Use no máximo 100 caracteres.";
  if (category.length > 100) fieldErrors.category = "Use no máximo 100 caracteres.";
  if (owner.length > 150) fieldErrors.owner = "Use no máximo 150 caracteres.";
  if (country.length > 100) fieldErrors.country = "Use no máximo 100 caracteres.";
  if (createdAt.length > 50) fieldErrors.created_at = "Use no máximo 50 caracteres.";
  if (!Number.isInteger(interested) || interested < 0 || interested > 1_000_000) {
    fieldErrors.interested = "Informe um número inteiro entre 0 e 1.000.000.";
  }

  if (Object.keys(fieldErrors).length) {
    return { error: { error: "Revise os campos destacados.", fieldErrors } };
  }

  return {
    data: {
      domain,
      status,
      price: price || null,
      category: category || null,
      owner: owner || null,
      country: country || null,
      created_at: createdAt || null,
      interested,
    },
  };
}

export function databaseErrorMessage(code?: string) {
  if (code === "23505") return "Este domínio já está cadastrado.";
  if (code === "42501") return "Você não tem permissão para realizar esta ação.";
  return "Não foi possível salvar o ativo. Tente novamente.";
}
