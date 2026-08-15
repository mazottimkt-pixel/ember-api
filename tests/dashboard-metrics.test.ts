import { describe, expect, it } from "vitest";
import { calculateDashboardMetrics, calculateOperationalMetrics, dashboardPeriodStart } from "@/lib/dashboard/metrics";

describe("dashboard metrics", () => {
  it("uses persisted status and values without projections", () => {
    const docs = [
      { id:"1", number:"O1", type:"quote", status:"draft", total:100, created_at:"2026-08-01", updated_at:"2026-08-01" },
      { id:"2", number:"O2", type:"quote", status:"confirmed", total:250, confirmed_at:"2026-08-02", created_at:"2026-08-02", updated_at:"2026-08-02" },
      { id:"3", number:"P1", type:"purchase_order", status:"sent", total:80, created_at:"2026-08-03", updated_at:"2026-08-03" },
    ];
    const result = calculateDashboardMetrics(docs);
    expect(result.quoteCount).toBe(2); expect(result.quoteTotal).toBe(350);
    expect(result.confirmedQuoteValue).toBe(250); expect(result.negotiationValue).toBe(100);
    expect(result.purchaseOrderCount).toBe(1); expect(result.pendingPurchaseOrderCount).toBe(0);
  });
  it("calculates the current month from its first day", () => expect(dashboardPeriodStart("month", new Date("2026-08-04T12:00:00-03:00"))).toContain("2026-08-01"));
  it("calculates operational status, delay and duration from real timestamps",()=>{const result=calculateOperationalMetrics([{id:"1",type:"service_order",status:"in_progress",created_at:"2026-08-01",due_at:"2026-08-02"},{id:"2",type:"service_order",status:"completed",created_at:"2026-08-01",started_at:"2026-08-01T10:00:00Z",completed_at:"2026-08-01T12:00:00Z"},{id:"3",type:"checklist",status:"completed_with_issues",created_at:"2026-08-01"},{id:"4",type:"service_report",status:"ready_for_acceptance",created_at:"2026-08-01"}],new Date("2026-08-04"));expect(result.orderCount).toBe(2);expect(result.overdue).toBe(1);expect(result.averageCompletionHours).toBe(2);expect(result.checklistsWithIssues).toBe(1);expect(result.reportsAwaitingAcceptance).toBe(1);});
});
