export const DOCUMENT_TYPES = [
  "quote",
  "purchase_order",
  "service_order",
  "receipt",
  "charge",
  "contract",
  "service_report",
  "checklist",
] as const;
export type RegistryDocumentType = (typeof DOCUMENT_TYPES)[number];
export type DocumentRegistryEntry = {
  type: RegistryDocumentType;
  label: string;
  availability: "enabled" | "planned";
  counterpartyKind: "customer" | "supplier" | "payer" | "parties" | "optional";
  requiredFields: readonly string[];
  optionalFields: readonly string[];
  allowedStates: readonly string[];
  supportedActions: readonly string[];
  requiresExplicitConfirmation: boolean;
  renderer: string | null;
  summaryBuilder: string | null;
};

export const documentRegistry: Record<
  RegistryDocumentType,
  DocumentRegistryEntry
> = {
  quote: {
    type: "quote",
    label: "Orçamento",
    availability: "enabled",
    counterpartyKind: "customer",
    requiredFields: [
      "counterpartyName",
      "items",
      "deadline",
      "paymentTerms",
      "validity",
    ],
    optionalFields: ["shipping", "notes"],
    allowedStates: [
      "draft",
      "awaiting_confirmation",
      "confirmed",
      "generated",
      "sent",
      "cancelled",
    ],
    supportedActions: [
      "create",
      "edit_draft",
      "confirm",
      "cancel",
      "generate_pdf",
      "view",
      "archive",
      "restore",
      "search",
    ],
    requiresExplicitConfirmation: true,
    renderer: "generateDocumentPdf",
    summaryBuilder: "buildAgentReviewSummary",
  },
  purchase_order: {
    type: "purchase_order",
    label: "Pedido de compra",
    availability: "enabled",
    counterpartyKind: "supplier",
    requiredFields: [
      "counterpartyName",
      "items",
      "deadline",
      "paymentTerms",
      "deliveryAddress",
    ],
    optionalFields: ["shipping", "notes"],
    allowedStates: [
      "draft",
      "awaiting_confirmation",
      "confirmed",
      "generated",
      "sent",
      "cancelled",
    ],
    supportedActions: [
      "create",
      "edit_draft",
      "confirm",
      "cancel",
      "generate_pdf",
      "view",
      "archive",
      "restore",
      "search",
    ],
    requiresExplicitConfirmation: true,
    renderer: "generateDocumentPdf",
    summaryBuilder: "buildAgentReviewSummary",
  },
  service_order: {
    type: "service_order",
    label: "Ordem de serviço",
    availability: "enabled",
    counterpartyKind: "customer",
    requiredFields: [
      "title",
      "description",
      "counterpartyId",
      "location",
      "responsibleId",
      "priority",
    ],
    optionalFields: [
      "team",
      "scheduledAt",
      "dueAt",
      "materials",
      "notes",
      "sourceDocumentId",
    ],
    allowedStates: [
      "draft",
      "pending_approval",
      "approved",
      "scheduled",
      "in_progress",
      "paused",
      "completed",
      "cancelled",
      "rejected",
    ],
    supportedActions: [
      "create",
      "submit",
      "approve",
      "schedule",
      "start",
      "pause",
      "resume",
      "complete",
      "cancel",
      "generate_pdf",
      "view",
      "archive",
      "restore",
      "search",
    ],
    requiresExplicitConfirmation: true,
    renderer: "generateOperationalPdf",
    summaryBuilder: "buildOperationalSummary",
  },
  receipt: planned("receipt", "Recibo", "payer"),
  charge: planned("charge", "Cobrança", "customer"),
  contract: planned("contract", "Contrato", "parties"),
  service_report: {
    type: "service_report",
    label: "Relatório de serviço ou vistoria",
    availability: "enabled",
    counterpartyKind: "customer",
    requiredFields: [
      "modality",
      "title",
      "counterpartyId",
      "location",
      "responsibleId",
      "objective",
      "findings",
      "conclusion",
    ],
    optionalFields: [
      "serviceOrderId",
      "checklistId",
      "activities",
      "materials",
      "nonConformities",
      "recommendations",
    ],
    allowedStates: [
      "draft",
      "under_review",
      "ready_for_acceptance",
      "accepted",
      "completed",
      "cancelled",
    ],
    supportedActions: [
      "create",
      "review",
      "request_acceptance",
      "accept",
      "complete",
      "cancel",
      "generate_pdf",
      "view",
      "archive",
      "restore",
      "search",
    ],
    requiresExplicitConfirmation: true,
    renderer: "generateOperationalPdf",
    summaryBuilder: "buildOperationalSummary",
  },
  checklist: {
    type: "checklist",
    label: "Checklist",
    availability: "enabled",
    counterpartyKind: "optional",
    requiredFields: ["title", "responsibleId", "items"],
    optionalFields: [
      "description",
      "counterpartyId",
      "location",
      "serviceOrderId",
      "templateId",
    ],
    allowedStates: [
      "draft",
      "in_progress",
      "completed",
      "completed_with_issues",
      "cancelled",
    ],
    supportedActions: [
      "create",
      "start",
      "update_items",
      "complete",
      "cancel",
      "generate_pdf",
      "view",
      "archive",
      "restore",
      "search",
    ],
    requiresExplicitConfirmation: true,
    renderer: "generateOperationalPdf",
    summaryBuilder: "buildOperationalSummary",
  },
};

function planned(
  type: RegistryDocumentType,
  label: string,
  counterpartyKind: DocumentRegistryEntry["counterpartyKind"],
): DocumentRegistryEntry {
  return {
    type,
    label,
    availability: "planned",
    counterpartyKind,
    requiredFields: [],
    optionalFields: [],
    allowedStates: [],
    supportedActions: [],
    requiresExplicitConfirmation: true,
    renderer: null,
    summaryBuilder: null,
  };
}

export const enabledDocumentTypes = () =>
  DOCUMENT_TYPES.map((type) => documentRegistry[type]).filter(
    (entry) => entry.availability === "enabled",
  );
export const isEnabledDocumentType = (
  type: string,
): type is RegistryDocumentType =>
  type in documentRegistry &&
  documentRegistry[type as RegistryDocumentType].availability === "enabled";
export const documentTypeLabel = (type: string) =>
  isEnabledDocumentType(type) ? documentRegistry[type].label : "Documento";

export const purchaseRequestLifecycle = {
  availability: "planned" as const,
  module: "purchase_order" as const,
  states: [
    "requested",
    "under_review",
    "approved",
    "rejected",
    "ordered",
    "cancelled",
  ] as const,
  transitions: {
    requested: ["under_review", "cancelled"],
    under_review: ["approved", "rejected", "cancelled"],
    approved: ["ordered", "cancelled"],
    rejected: [],
    ordered: [],
    cancelled: [],
  } as const,
};
