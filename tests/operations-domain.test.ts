import { describe, expect, it } from "vitest";
import {
  assertServiceOrderCompletion,
  assertTransition,
  checklistInputSchema,
  contentFingerprint,
  operationalNumberPrefix,
  resolveChecklistCompletion,
  serviceOrderInputSchema,
  serviceReportInputSchema,
  validateAttachment,
} from "@/lib/operations/domain";
const uuid = "11111111-1111-4111-8111-111111111111";
describe("operational domain", () => {
  it("validates service orders and required fields", () => {
    expect(
      serviceOrderInputSchema.parse({
        type: "service_order",
        title: "Instalação",
        description: "Instalar equipamento",
        counterpartyId: uuid,
        location: "Rua A, 10",
        responsibleId: uuid,
        requestId: uuid,
      }).priority,
    ).toBe("normal");
    expect(() =>
      serviceOrderInputSchema.parse({ type: "service_order" }),
    ).toThrow();
  });
  it("allows only declared service order transitions", () => {
    expect(() =>
      assertTransition("service_order", "draft", "pending_approval"),
    ).not.toThrow();
    expect(() =>
      assertTransition("service_order", "draft", "completed"),
    ).toThrow("INVALID_OPERATIONAL_TRANSITION");
    expect(() =>
      assertTransition("service_order", "cancelled", "in_progress"),
    ).toThrow();
  });
  it("requires completion owner and date", () => {
    expect(() => assertServiceOrderCompletion({})).toThrow(
      "RESPONSIBLE_REQUIRED",
    );
    expect(() => assertServiceOrderCompletion({ responsibleId: uuid })).toThrow(
      "COMPLETION_DATE_REQUIRED",
    );
    expect(() =>
      assertServiceOrderCompletion({
        responsibleId: uuid,
        completedAt: new Date().toISOString(),
        checklistStatus: "in_progress",
      }),
    ).toThrow("CHECKLIST_BLOCKS_COMPLETION");
  });
  it("resolves checklist completion and issues", () => {
    expect(
      resolveChecklistCompletion([{ required: true, status: "completed" }]),
    ).toBe("completed");
    expect(
      resolveChecklistCompletion([{ required: true, status: "non_compliant" }]),
    ).toBe("completed_with_issues");
    expect(() =>
      resolveChecklistCompletion([{ required: true, status: "pending" }]),
    ).toThrow();
    expect(() =>
      resolveChecklistCompletion([
        { required: true, status: "not_applicable", notes: "" },
      ]),
    ).toThrow();
  });
  it("validates linked checklists and both report modalities", () => {
    expect(
      checklistInputSchema.parse({
        type: "checklist",
        title: "Saída",
        responsibleId: uuid,
        serviceOrderId: uuid,
        items: [{ title: "Limpeza" }],
        requestId: uuid,
      }).items,
    ).toHaveLength(1);
    for (const modality of ["service", "inspection"] as const)
      expect(
        serviceReportInputSchema.parse({
          type: "service_report",
          modality,
          title: "Relatório",
          counterpartyId: uuid,
          location: "Local",
          responsibleId: uuid,
          objective: "Verificar",
          findings: "Tudo certo",
          conclusion: "Concluído",
          requestId: uuid,
        }).modality,
      ).toBe(modality);
  });
  it("creates stable fingerprints regardless of key order", () =>
    expect(contentFingerprint({ b: 2, a: 1 })).toBe(
      contentFingerprint({ a: 1, b: 2 }),
    ));
  it("uses independent prefixes", () => {
    expect(operationalNumberPrefix("service_order")).toBe("OS");
    expect(operationalNumberPrefix("service_report", "inspection")).toBe("VIS");
    expect(operationalNumberPrefix("service_report", "service")).toBe("REL");
  });
  it("validates allowed attachment signatures", () => {
    expect(
      validateAttachment({
        name: "foto.jpg",
        mimeType: "image/jpeg",
        size: 2,
        bytes: new Uint8Array([0xff, 0xd8]),
      }),
    ).toBe(true);
    expect(
      validateAttachment({
        name: "laudo.pdf",
        mimeType: "application/pdf",
        size: 4,
        bytes: new TextEncoder().encode("%PDF"),
      }),
    ).toBe(true);
    expect(() =>
      validateAttachment({
        name: "virus.exe",
        mimeType: "application/octet-stream",
        size: 10,
      }),
    ).toThrow();
    expect(() =>
      validateAttachment({ name: "vazio.png", mimeType: "image/png", size: 0 }),
    ).toThrow();
    expect(() =>
      validateAttachment({
        name: "falso.png",
        mimeType: "image/png",
        size: 2,
        bytes: new Uint8Array([1, 2]),
      }),
    ).toThrow();
  });
});
