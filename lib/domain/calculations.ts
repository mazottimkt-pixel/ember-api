import type { DocumentItemInput } from "./schemas";

const cents = (value: number) => Math.round(value * 100);
export function calculateDocument(items: DocumentItemInput[], shipping = 0) {
  const lines = items.map((item) => {
    const grossCents = cents(item.quantity * item.unitPrice);
    const discountCents = cents(item.discount);
    if (discountCents > grossCents)
      throw new Error("O desconto do item não pode superar seu valor bruto");
    return { ...item, lineTotal: (grossCents - discountCents) / 100 };
  });
  const subtotalCents = lines.reduce(
    (sum, item) => sum + cents(item.quantity * item.unitPrice),
    0,
  );
  const discountCents = lines.reduce(
    (sum, item) => sum + cents(item.discount),
    0,
  );
  const totalCents = subtotalCents - discountCents + cents(shipping);
  return {
    items: lines,
    subtotal: subtotalCents / 100,
    discount: discountCents / 100,
    shipping: cents(shipping) / 100,
    total: totalCents / 100,
  };
}

export function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}
