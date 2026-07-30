import type { AIExtraction } from "./schemas";

export function missingFields(data: AIExtraction): string[] {
  const fields: string[] = [];
  if (!data.type) fields.push("tipo de documento");
  if (!data.counterpartyName)
    fields.push(data.type === "purchase_order" ? "fornecedor" : "cliente");
  if (!data.items?.length) fields.push("itens");
  if (!data.deadline) fields.push("prazo");
  if (!data.paymentTerms) fields.push("condição de pagamento");
  if (data.type === "quote" && !data.validity) fields.push("validade");
  if (data.type === "purchase_order" && !data.deliveryAddress)
    fields.push("endereço de entrega");
  return fields;
}
