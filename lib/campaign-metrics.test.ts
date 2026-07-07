import { describe, expect, it } from "vitest";
import { deriveCampaignMetrics } from "./campaign-metrics";

describe("deriveCampaignMetrics", () => {
  it("derives live counters from email statuses", () => {
    const metrics = deriveCampaignMetrics([
      { status: "sent", approvalStatus: "approved" },
      { status: "sent", approvalStatus: "approved" },
      { status: "failed", approvalStatus: "approved" },
      { status: "generated", approvalStatus: "pending" },
      { status: "approved", approvalStatus: "approved" },
      { status: "skipped", approvalStatus: "skipped" },
    ]);

    expect(metrics).toEqual({
      sentCount: 2,
      failedCount: 1,
      skippedCount: 1,
      pendingCount: 2,
      approvalPendingCount: 1,
    });
  });
});
