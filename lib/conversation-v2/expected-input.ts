import { z } from "zod";

export const CANONICAL_EXPECTED_INPUT_VALUES = [
  "document_type", "counterparty", "tax_id", "item_bundle", "delivery_deadline",
  "payment", "validity", "address", "confirmation", "correction", "free_text", "none",
] as const;
export const expectedInputV2Schema = z.enum(CANONICAL_EXPECTED_INPUT_VALUES);
export type ExpectedInputV2 = z.infer<typeof expectedInputV2Schema>;
export type ExpectedInputOrigin = "expectedAnswer" | "pendingField" | "activePrompt";

export const LEGACY_EXPECTED_INPUT_MAPPING = {
  document_type: "document_type",
  "tipo de documento": "document_type",
  counterparty: "counterparty",
  cliente: "counterparty",
  fornecedor: "counterparty",
  tax_id: "tax_id",
  cnpj: "tax_id",
  item_bundle: "item_bundle",
  itens: "item_bundle",
  price_scope: "item_bundle",
  delivery_deadline: "delivery_deadline",
  prazo: "delivery_deadline",
  payment: "payment",
  payment_terms: "payment",
  "condição de pagamento": "payment",
  validity: "validity",
  quote_validity: "validity",
  validade: "validity",
  address: "address",
  "endereço de entrega": "address",
  confirmation: "confirmation",
  confirmação: "confirmation",
  correction: "correction",
  correção: "correction",
  document_selection: "free_text",
  free_text: "free_text",
  none: "none",
} as const satisfies Record<string, ExpectedInputV2>;

export type ExpectedInputNormalization =
  | { status: "canonical"; value: ExpectedInputV2; raw: string; origin: ExpectedInputOrigin }
  | { status: "unsupported"; code: "EXPECTED_INPUT_UNSUPPORTED"; raw: string; origin: ExpectedInputOrigin };

const sanitize = (value: string) => value.normalize("NFC").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

export function normalizeExpectedInput(value: unknown, origin: ExpectedInputOrigin): ExpectedInputNormalization | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value !== "string") return { status: "unsupported", code: "EXPECTED_INPUT_UNSUPPORTED", raw: `<${typeof value}>`, origin };
  const raw = sanitize(value);
  const canonical = LEGACY_EXPECTED_INPUT_MAPPING[raw as keyof typeof LEGACY_EXPECTED_INPUT_MAPPING];
  return canonical
    ? { status: "canonical", value: canonical, raw, origin }
    : { status: "unsupported", code: "EXPECTED_INPUT_UNSUPPORTED", raw, origin };
}
