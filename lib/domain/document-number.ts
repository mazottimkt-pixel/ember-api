export function formatDocumentNumber(
  type: "quote" | "purchase_order",
  sequence: number,
  year = new Date().getUTCFullYear(),
) {
  if (!Number.isSafeInteger(sequence) || sequence < 1)
    throw new Error("Sequência inválida");
  return `${type === "quote" ? "ORC" : "PC"}-${year}-${String(sequence).padStart(6, "0")}`;
}
