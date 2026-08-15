import type { SupabaseClient } from "@supabase/supabase-js";

export type DashboardPeriod = "7d" | "30d" | "month";
export function dashboardPeriodStart(
  period: DashboardPeriod,
  now = new Date(),
) {
  const start = new Date(now);
  if (period === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(start.getDate() - (period === "7d" ? 7 : 30));
    start.setHours(0, 0, 0, 0);
  }
  return start.toISOString();
}
export function parseDashboardPeriod(value?: string): DashboardPeriod {
  return value === "7d" || value === "month" ? value : "30d";
}

type MetricDocument = {
  id: string;
  number: string;
  type: string;
  status: string;
  total: number | string;
  created_at: string;
  updated_at: string;
  confirmed_at?: string | null;
  counterparty_snapshot?: unknown;
};
export function calculateDashboardMetrics(documents: MetricDocument[]) {
  const quotes = documents.filter((doc) => doc.type === "quote");
  const orders = documents.filter((doc) => doc.type === "purchase_order");
  const confirmed = (doc: MetricDocument) =>
    Boolean(doc.confirmed_at) &&
    ["confirmed", "generated", "sent"].includes(doc.status);
  const open = (doc: MetricDocument) =>
    ["draft", "awaiting_confirmation"].includes(doc.status);
  const byStatus = Object.fromEntries(
    [
      "draft",
      "awaiting_confirmation",
      "confirmed",
      "generated",
      "sent",
      "cancelled",
    ].map((status) => [
      status,
      quotes.filter((doc) => doc.status === status).length,
    ]),
  );
  return {
    quoteCount: quotes.length,
    quoteByStatus: byStatus,
    quoteTotal: sum(quotes),
    confirmedQuoteCount: quotes.filter(confirmed).length,
    confirmedQuoteValue: sum(quotes.filter(confirmed)),
    negotiationValue: sum(quotes.filter(open)),
    purchaseOrderCount: orders.length,
    purchaseOrderTotal: sum(orders),
    pendingPurchaseOrderCount: orders.filter(
      (doc) => !["sent", "cancelled"].includes(doc.status),
    ).length,
    attention: documents.filter(
      (doc) => doc.status === "awaiting_confirmation",
    ),
  };
}
const sum = (documents: MetricDocument[]) =>
  documents.reduce((total, doc) => total + Number(doc.total || 0), 0);
type OperationalMetric = {
  id: string;
  type: string;
  status: string;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  scheduled_at?: string | null;
  due_at?: string | null;
  responsible_id?: string | null;
};
export function calculateOperationalMetrics(
  documents: OperationalMetric[],
  now = new Date(),
) {
  const orders = documents.filter((d) => d.type === "service_order"),
    checklists = documents.filter((d) => d.type === "checklist"),
    reports = documents.filter((d) => d.type === "service_report"),
    completed = orders.filter((d) => d.status === "completed");
  const durations = completed
    .filter((d) => d.started_at && d.completed_at)
    .map(
      (d) =>
        new Date(d.completed_at!).getTime() - new Date(d.started_at!).getTime(),
    )
    .filter((ms) => ms >= 0);
  return {
    orderCount: orders.length,
    ordersByStatus: Object.fromEntries(
      [
        "draft",
        "pending_approval",
        "approved",
        "scheduled",
        "in_progress",
        "paused",
        "completed",
        "cancelled",
      ].map((status) => [
        status,
        orders.filter((d) => d.status === status).length,
      ]),
    ),
    scheduled: orders.filter((d) => d.status === "scheduled").length,
    inProgress: orders.filter((d) => d.status === "in_progress").length,
    completed: completed.length,
    overdue: orders.filter(
      (d) =>
        d.due_at &&
        new Date(d.due_at) < now &&
        !["completed", "cancelled"].includes(d.status),
    ).length,
    averageCompletionHours: durations.length
      ? durations.reduce((a, b) => a + b, 0) / durations.length / 3_600_000
      : null,
    checklistsInProgress: checklists.filter((d) => d.status === "in_progress")
      .length,
    checklistsWithIssues: checklists.filter(
      (d) => d.status === "completed_with_issues",
    ).length,
    reportsPending: reports.filter((d) =>
      ["draft", "under_review"].includes(d.status),
    ).length,
    reportsCompleted: reports.filter((d) => d.status === "completed").length,
    reportsAwaitingAcceptance: reports.filter(
      (d) => d.status === "ready_for_acceptance",
    ).length,
  };
}
export function calculateContentMetrics(
  projects: Array<{ status: string }>,
  images: Array<{ status: string }>,
) {
  return {
    created: projects.length,
    drafts: projects.filter((p) => p.status === "draft").length,
    approved: projects.filter((p) => p.status === "approved").length,
    failed: projects.filter((p) => p.status === "failed").length,
    imagesGenerated: images.filter((i) =>
      ["ready_for_review", "approved"].includes(i.status),
    ).length,
  };
}

export async function loadDashboardData(
  supabase: SupabaseClient,
  organizationId: string,
  period: DashboardPeriod,
) {
  const start = dashboardPeriodStart(period);
  const [
    { data: documents, error },
    { data: recentDocuments },
    { data: recentContacts },
    { data: operationalDocuments, error: operationalError },
    { data: contentProjects },
    { data: contentImages },
  ] = await Promise.all([
    supabase
      .from("documents")
      .select(
        "id,number,type,status,total,created_at,updated_at,confirmed_at,counterparty_snapshot",
      )
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .gte("created_at", start)
      .limit(5000),
    supabase
      .from("documents")
      .select("id,number,type,status,total,created_at,counterparty_snapshot")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("business_contacts")
      .select("id,legal_name,is_customer,is_supplier,created_at")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("operational_documents")
      .select(
        "id,type,status,created_at,started_at,completed_at,scheduled_at,due_at,responsible_id",
      )
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .gte("created_at", start)
      .limit(5000),
    supabase
      .from("content_projects")
      .select("status")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .gte("created_at", start)
      .limit(5000),
    supabase
      .from("content_images")
      .select("status")
      .eq("organization_id", organizationId)
      .gte("created_at", start)
      .limit(5000),
  ]);
  if (error) throw new Error("DASHBOARD_METRICS_FAILED");
  return {
    period,
    start,
    metrics: calculateDashboardMetrics((documents ?? []) as MetricDocument[]),
    operationalMetrics: operationalError
      ? null
      : calculateOperationalMetrics(
          (operationalDocuments ?? []) as OperationalMetric[],
        ),
    contentMetrics: calculateContentMetrics(
      contentProjects ?? [],
      contentImages ?? [],
    ),
    recentDocuments: recentDocuments ?? [],
    recentContacts: recentContacts ?? [],
  };
}
