import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { calculateDocument, formatBRL } from "@/lib/domain/calculations";
import { documentSchema, type DocumentInput } from "@/lib/domain/schemas";
import { formatDateBR } from "@/lib/domain/brazil";

type Meta = {
  organizationName: string;
  number: string;
  issuerName: string;
  issuerEmail?: string;
  issuerJobTitle?: string;
  organizationDetails?: string[];
  counterpartyDetails?: string[];
  validationCode: string;
  logoBytes?: Uint8Array;
  generatedAt?: Date;
};

export async function generateDocumentPdf(input: DocumentInput, meta: Meta) {
  const data = documentSchema.parse(input);
  const totals = calculateDocument(data.items, data.shipping);
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const generated = meta.generatedAt ?? new Date();
  let logo: PDFImage | undefined;
  if (meta.logoBytes) {
    try {
      logo =
        meta.logoBytes[0] === 0x89
          ? await pdf.embedPng(meta.logoBytes)
          : await pdf.embedJpg(meta.logoBytes);
    } catch {
      /* PDF remains valid without an invalid logo. */
    }
  }

  const width = 595;
  const height = 842;
  const margin = 42;
  let page: PDFPage = pdf.addPage([width, height]);
  let y = height - margin;
  let pageNumber = 1;

  const wrap = (value: string, max: number, font: PDFFont, size: number) => {
    const words = value.replace(/\s+/g, " ").trim().split(" ");
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= max) line = candidate;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  };
  const footer = () => {
    page.drawLine({
      start: { x: margin, y: 34 },
      end: { x: width - margin, y: 34 },
      thickness: 0.5,
      color: rgb(0.78, 0.8, 0.78),
    });
    page.drawText(
      `Validação: ${meta.validationCode} | ${generated.toLocaleString("pt-BR")} | Página ${pageNumber}`,
      { x: margin, y: 19, size: 7, font: regular, color: rgb(0.35, 0.4, 0.37) },
    );
  };
  const drawBrand = () => {
    if (logo)
      page.drawImage(logo, { x: margin, y: y - 35, width: 70, height: 35 });
    const brandX = logo ? 125 : margin;
    const brandLines = wrap(
      meta.organizationName,
      width - margin - brandX,
      bold,
      15,
    ).slice(0, 2);
    brandLines.forEach((line, index) =>
      page.drawText(line, {
        x: brandX,
        y: y - 18 - index * 18,
        size: 15,
        font: bold,
        color: rgb(0.08, 0.27, 0.18),
      }),
    );
    y -= Math.max(54, brandLines.length * 18 + 26);
  };
  const newPage = () => {
    footer();
    page = pdf.addPage([width, height]);
    pageNumber += 1;
    y = height - margin;
    drawBrand();
  };
  const text = (value: string, size = 9, isBold = false) => {
    const font = isBold ? bold : regular;
    for (const line of wrap(value, width - margin * 2, font, size)) {
      if (y < 65) newPage();
      page.drawText(line, {
        x: margin,
        y,
        size,
        font,
        color: rgb(0.1, 0.14, 0.12),
      });
      y -= size + 5;
    }
  };
  const tableHeader = () => {
    page.drawRectangle({
      x: margin,
      y: y - 20,
      width: width - margin * 2,
      height: 22,
      color: rgb(0.09, 0.3, 0.21),
    });
    for (const [label, x] of [
      ["Descrição", margin + 7],
      ["Qtd.", 330],
      ["Unitário", 395],
      ["Total", 490],
    ] as const) {
      page.drawText(label, {
        x,
        y: y - 14,
        size: 8,
        font: bold,
        color: rgb(1, 1, 1),
      });
    }
    y -= 30;
  };

  drawBrand();
  text(data.type === "quote" ? "ORÇAMENTO" : "PEDIDO DE COMPRA", 15, true);
  text(`Número ${meta.number} | ${generated.toLocaleDateString("pt-BR")}`);
  for (const detail of meta.organizationDetails ?? []) text(detail, 8);
  y -= 8;
  text(
    `${data.type === "quote" ? "Cliente" : "Fornecedor"}: ${data.counterpartyName}`,
    11,
    true,
  );
  for (const detail of meta.counterpartyDetails ?? []) text(detail, 8);
  y -= 12;
  tableHeader();
  for (const item of totals.items) {
    const description = wrap(item.description, 270, regular, 8);
    const rowHeight = Math.max(25, description.length * 14 + 8);
    if (y - rowHeight < 70) {
      newPage();
      tableHeader();
    }
    description.forEach((line, index) =>
      page.drawText(line, {
        x: margin + 7,
        y: y - index * 14,
        size: 8,
        font: regular,
      }),
    );
    page.drawText(`${item.quantity} ${item.unit}`, {
      x: 330,
      y,
      size: 8,
      font: regular,
    });
    page.drawText(formatBRL(item.unitPrice), {
      x: 395,
      y,
      size: 8,
      font: regular,
    });
    page.drawText(formatBRL(item.lineTotal), {
      x: 490,
      y,
      size: 8,
      font: bold,
    });
    y -= rowHeight;
    page.drawLine({
      start: { x: margin, y: y + 5 },
      end: { x: width - margin, y: y + 5 },
      thickness: 0.35,
      color: rgb(0.85, 0.87, 0.85),
    });
  }
  y -= 8;
  text(`Subtotal: ${formatBRL(totals.subtotal)}`);
  text(`Descontos: ${formatBRL(totals.discount)}`);
  text(`Frete: ${formatBRL(totals.shipping)}`);
  text(`TOTAL: ${formatBRL(totals.total)}`, 14, true);
  y -= 10;
  text(`Prazo: ${data.deadline}`, 9, true);
  text(`Pagamento: ${data.paymentTerms}`);
  if (data.validity) text(`Validade: ${formatDateBR(data.validity)}`);
  if (data.deliveryAddress) text(`Entrega: ${data.deliveryAddress}`);
  if (data.notes) {
    y -= 6;
    text("Observações", 10, true);
    text(data.notes);
  }
  y -= 10;
  text(`Responsável: ${meta.issuerName}`, 8);
  if (meta.issuerJobTitle) text(`Cargo: ${meta.issuerJobTitle}`, 8);
  if (meta.issuerEmail) text(`E-mail: ${meta.issuerEmail}`, 8);
  footer();
  pdf.setTitle(
    `${data.type === "quote" ? "Orçamento" : "Pedido"} ${meta.number}`,
  );
  pdf.setCreator("Ember Comercial");
  return pdf.save();
}
