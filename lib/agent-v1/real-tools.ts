import "server-only";
import { z } from "zod";
import {
  createAgentDraft,
  confirmAgentDocument,
  findContact,
  type AgentToolContext,
} from "@/lib/ai/tools";
import { generateStoredDocumentPdf } from "@/lib/pdf/store-document";
import { searchAdministrativeFiles } from "@/lib/administrative-vault/files";
import type { AgentV1ToolHandlers } from "./tool-registry";
import type { TaskStateV1 } from "./task-state";
import { persistBranding } from "@/lib/branding/store";

const documentRef = z.object({ documentId: z.uuid(), number: z.string() });
const encode = (value: unknown) => JSON.stringify(value);
export const decodeDocumentRef = (value: string) =>
  documentRef.parse(JSON.parse(value));

export function createAgentV1RealTools(input: {
  ctx: AgentToolContext;
  brandingLogoRef?: string;
  deliverDocument: (
    file: { url: string; filename: string },
    requestId: string,
  ) => Promise<string>;
}): AgentV1ToolHandlers {
  const create = async (task: TaskStateV1, requestId: string) => {
    if (!task.party) throw new Error("PARTY_NOT_RESOLVED");
    const document = await createAgentDraft(
      input.ctx,
      task.collectedData,
      requestId,
      {
        source: task.party.source,
        name: task.party.name,
        contactId: task.party.contactId,
        taxId: task.party.documentNumber,
      },
    );
    await confirmAgentDocument(input.ctx, document.id, true);
    return {
      resultRef: encode({ documentId: document.id, number: document.number }),
    };
  };
  return {
    create_quote: create,
    create_purchase_order: create,
    resolve_party: async (task) => {
      const name = task.collectedData.counterpartyName;
      if (!name) return { resultRef: "[]" };
      const rows = await findContact(
        input.ctx,
        name,
        task.type === "purchase_order" ? "supplier" : "customer",
      );
      return {
        resultRef: JSON.stringify(
          rows.map((row) => ({
            contactId: row.id,
            name: row.legal_name,
            documentNumber: row.tax_id ?? undefined,
          })),
        ),
      };
    },
    generate_document_pdf: async (task) => {
      if (!task.effects.document.ref) throw new Error("DOCUMENT_REF_MISSING");
      const ref = decodeDocumentRef(task.effects.document.ref),
        file = await generateStoredDocumentPdf(input.ctx.supabase, {
          organizationId: input.ctx.organizationId,
          userId: input.ctx.userId,
          documentId: ref.documentId,
        });
      return { resultRef: encode(file) };
    },
    send_document: async (task, requestId) => {
      if (!task.effects.pdf.ref) throw new Error("PDF_REF_MISSING");
      const file = z
        .object({ url: z.string().url(), filename: z.string().min(1) })
        .parse(JSON.parse(task.effects.pdf.ref));
      return { resultRef: await input.deliverDocument(file, requestId) };
    },
    find_business_information: async () => {
      const result = await input.ctx.supabase
        .from("organizations")
        .select("name,legal_name,tax_id")
        .eq("id", input.ctx.organizationId)
        .single();
      if (result.error || !result.data)
        throw new Error("BUSINESS_INFORMATION_NOT_FOUND");
      return {
        resultRef: [
          result.data.legal_name ?? result.data.name,
          result.data.tax_id,
        ]
          .filter(Boolean)
          .join(" — "),
      };
    },
    find_organization_tax_id: async () => {
      const result = await input.ctx.supabase
        .from("organizations")
        .select("tax_id")
        .eq("id", input.ctx.organizationId)
        .single();
      if (result.error || !result.data?.tax_id)
        throw new Error("BUSINESS_TAX_ID_NOT_FOUND");
      return { resultRef: String(result.data.tax_id) };
    },
    search_vault: async (task) => {
      const rows = await searchAdministrativeFiles(input.ctx.supabase, {
        organizationId: input.ctx.organizationId,
        query:
          task.collectedData.documentQuery ??
          task.collectedData.counterpartyName ??
          "",
        limit: 5,
      });
      return {
        resultRef: rows.length
          ? rows.map((row) => row.title ?? row.original_filename).join("\n")
          : "Nenhum arquivo encontrado.",
      };
    },
    save_brand_logo: async () => {
      if (!input.brandingLogoRef) throw new Error("BRANDING_LOGO_REF_MISSING");
      const saved = await persistBranding(input.ctx, {
        status: "configured",
        logoStoragePath: input.brandingLogoRef,
      });
      return { resultRef: String(saved.id) };
    },
  };
}
