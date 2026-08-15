import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generateOperationalPdf } from "@/lib/operations/pdf";
describe("operational PDFs", () => {
  it.each([
    ["service_order", null, "OS-000001"],
    ["checklist", null, "CHK-000001"],
    ["service_report", "service", "REL-000001"],
    ["service_report", "inspection", "VIS-000001"],
  ] as const)("renders %s/%s", async (type, modality, number) => {
    const bytes = await generateOperationalPdf({
      type,
      modality,
      number,
      status: "draft",
      title: "Operação de teste",
      description: "Descrição segura",
      organizationName: "Empresa teste",
      counterpartyName: "Cliente teste",
      location: "Local teste",
      responsibleName: "Técnico teste",
      content: { conclusion: "Sem dados reais" },
      items:
        type === "checklist"
          ? [{ title: "Verificar item", status: "completed", required: true }]
          : undefined,
    });
    expect(bytes.length).toBeGreaterThan(500);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
  });
  it("paginates long checklists", async () => {
    const bytes = await generateOperationalPdf({
      type: "checklist",
      number: "CHK-000002",
      status: "completed",
      title: "Checklist longo",
      organizationName: "Empresa",
      items: Array.from({ length: 150 }, (_, i) => ({
        title: `Item operacional ${i} com descrição longa para validar quebra de página`,
        status: "completed",
        required: true,
      })),
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(2);
  });
});
