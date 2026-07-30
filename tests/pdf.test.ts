import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { generateDocumentPdf } from "@/lib/pdf/generate";

const meta = {
  organizationName: "Ember Comercial",
  number: "ORC-2026-000001",
  issuerName: "Ana Souza",
  validationCode: "abc-123",
};

describe("PDF", () => {
  it("gera um PDF A4 válido", async () => {
    const bytes = await generateDocumentPdf(
      {
        type: "quote",
        counterpartyName: "Clínica Alfa",
        items: [
          {
            description: "Manutenção preventiva",
            quantity: 12,
            unit: "un",
            unitPrice: 180,
            discount: 0,
          },
        ],
        shipping: 0,
        deadline: "5 dias",
        paymentTerms: "50% na aprovação e 50% na conclusão",
        validity: "15 dias",
      },
      meta,
    );
    expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe("%PDF");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPage(0).getSize()).toEqual({ width: 595, height: 842 });
  });

  it("quebra páginas com muitos itens e textos longos", async () => {
    const bytes = await generateDocumentPdf(
      {
        type: "purchase_order",
        counterpartyName: "Distribuidora Técnica Nacional",
        items: Array.from({ length: 55 }, (_, index) => ({
          description: `Item ${index + 1}: equipamento profissional com descrição detalhada para validar quebra automática de linha e de página`,
          quantity: index + 1,
          unit: "un",
          unitPrice: 99.9,
          discount: 4.9,
        })),
        shipping: 150,
        deadline: "Entrega em até 20 dias úteis",
        paymentTerms: "30 dias após o recebimento",
        deliveryAddress: "Rua das Flores, 1000, São Paulo - SP",
        notes: "Conferir todos os volumes e registrar eventuais avarias no recebimento.",
      },
      meta,
    );
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });
});
