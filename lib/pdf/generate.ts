import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { calculateDocument, formatBRL } from "@/lib/domain/calculations";
import { documentSchema, type DocumentInput } from "@/lib/domain/schemas";

export async function generateDocumentPdf(input: DocumentInput, meta: { organizationName: string; number: string; issuerName: string; validationCode: string }) {
  const data = documentSchema.parse(input); const totals = calculateDocument(data.items, data.shipping);
  const pdf = await PDFDocument.create(); const page = pdf.addPage([595, 842]); const font = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = 790; const write = (text: string, size = 10, isBold = false) => { page.drawText(text.slice(0, 100), { x: 45, y, size, font: isBold ? bold : font, color: rgb(0.1, 0.13, 0.18) }); y -= size + 9; };
  write(meta.organizationName, 18, true); write(data.type === "quote" ? "ORÇAMENTO" : "PEDIDO DE COMPRA", 14, true); write(`Número: ${meta.number} | Data: ${new Date().toLocaleDateString("pt-BR")}`); write(`${data.type === "quote" ? "Cliente" : "Fornecedor"}: ${data.counterpartyName}`); y -= 8;
  totals.items.forEach((item) => write(`${item.quantity} ${item.unit}  ${item.description}  ${formatBRL(item.lineTotal)}`)); y -= 8;
  write(`Subtotal: ${formatBRL(totals.subtotal)}`); write(`Descontos: ${formatBRL(totals.discount)}`); write(`Frete: ${formatBRL(totals.shipping)}`); write(`TOTAL: ${formatBRL(totals.total)}`, 13, true); y -= 8;
  write(`Prazo: ${data.deadline}`); write(`Pagamento: ${data.paymentTerms}`); if (data.notes) write(`Observações: ${data.notes}`); y = 45; write(`Responsável: ${meta.issuerName} | Validação: ${meta.validationCode} | Gerado em ${new Date().toLocaleString("pt-BR")}`, 8);
  return pdf.save();
}
