import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
type OperationalPdfInput = {
  type: "service_order" | "checklist" | "service_report";
  modality?: "service" | "inspection" | null;
  number: string;
  status: string;
  title: string;
  description?: string | null;
  organizationName: string;
  counterpartyName?: string;
  location?: string;
  responsibleName?: string;
  priority?: string;
  scheduledAt?: string | null;
  dueAt?: string | null;
  content?: Record<string, unknown>;
  items?: Array<{
    title: string;
    status: string;
    required: boolean;
    notes?: string | null;
  }>;
  acceptance?: Record<string, unknown> | null;
  generatedAt?: Date;
};
export async function generateOperationalPdf(input: OperationalPdfInput) {
  const pdf = await PDFDocument.create(),
    regular = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = 595,
    height = 842,
    margin = 42;
  let page: PDFPage = pdf.addPage([width, height]),
    y = height - margin,
    pageNumber = 1;
  const wrap = (value: string, max: number, font: PDFFont, size: number) => {
    const lines: string[] = [];
    let line = "";
    for (const word of value.replace(/\s+/g, " ").trim().split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= max) line = next;
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
      start: { x: margin, y: 35 },
      end: { x: width - margin, y: 35 },
      thickness: 0.5,
      color: rgb(0.75, 0.78, 0.76),
    });
    page.drawText(`Lume • IA | Página ${pageNumber}`, {
      x: margin,
      y: 20,
      size: 8,
      font: regular,
      color: rgb(0.3, 0.35, 0.32),
    });
  };
  const newPage = () => {
    footer();
    page = pdf.addPage([width, height]);
    pageNumber++;
    y = height - margin;
    header();
  };
  const text = (value: string, size = 9, strong = false) => {
    const font = strong ? bold : regular;
    for (const line of wrap(value, width - margin * 2, font, size)) {
      if (y < 65) newPage();
      page.drawText(line, {
        x: margin,
        y,
        size,
        font,
        color: rgb(0.08, 0.13, 0.1),
      });
      y -= size + 5;
    }
  };
  const header = () => {
    page.drawRectangle({
      x: 0,
      y: height - 92,
      width,
      height: 92,
      color: rgb(0.08, 0.3, 0.2),
    });
    page.drawText(input.organizationName, {
      x: margin,
      y: height - 57,
      size: 16,
      font: bold,
      color: rgb(1, 1, 1),
    });
    y = height - 118;
  };
  header();
  const label =
    input.type === "service_order"
      ? "ORDEM DE SERVIÇO"
      : input.type === "checklist"
        ? "CHECKLIST"
        : input.modality === "inspection"
          ? "RELATÓRIO DE VISTORIA"
          : "RELATÓRIO DE SERVIÇO";
  text(label, 15, true);
  text(`${input.number} · ${input.status}`, 10, true);
  text(input.title, 13, true);
  if (input.description) text(input.description);
  y -= 8;
  if (input.counterpartyName) text(`Cliente: ${input.counterpartyName}`);
  if (input.location) text(`Local: ${input.location}`);
  if (input.responsibleName) text(`Responsável: ${input.responsibleName}`);
  if (input.priority) text(`Prioridade: ${input.priority}`);
  if (input.scheduledAt)
    text(
      `Data prevista: ${new Date(input.scheduledAt).toLocaleString("pt-BR")}`,
    );
  if (input.dueAt)
    text(`Prazo: ${new Date(input.dueAt).toLocaleString("pt-BR")}`);
  if (input.items?.length) {
    y -= 10;
    text("Itens", 11, true);
    for (const [index, item] of input.items.entries()) {
      if (y < 85) newPage();
      text(
        `${index + 1}. [${item.status}] ${item.title}${item.required ? " (obrigatório)" : ""}`,
        9,
        true,
      );
      if (item.notes) text(`Observação: ${item.notes}`, 8);
    }
  }
  if (input.content) {
    for (const [key, value] of Object.entries(input.content)) {
      if (
        value === null ||
        value === undefined ||
        value === "" ||
        (Array.isArray(value) && !value.length)
      )
        continue;
      y -= 6;
      text(key.replace(/([A-Z])/g, " $1"), 10, true);
      text(Array.isArray(value) ? value.join("; ") : String(value));
    }
  }
  if (input.acceptance) {
    y -= 10;
    text("Aceite operacional", 11, true);
    text(
      `Aceite registrado por ${String(input.acceptance.name ?? "—")} (${String(input.acceptance.role ?? "—")}) em ${new Date(String(input.acceptance.acceptedAt)).toLocaleString("pt-BR")}.`,
    );
    text(
      "Este registro representa concordância operacional no sistema e não presume assinatura eletrônica avançada ou validade jurídica universal.",
      8,
    );
  }
  footer();
  pdf.setTitle(`${label} ${input.number}`);
  pdf.setCreator("Lume");
  return pdf.save();
}
