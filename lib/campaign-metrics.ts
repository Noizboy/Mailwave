type CampaignEmailMetricInput = {
  approvalStatus: string;
  status: string;
};

export type CampaignDerivedMetrics = {
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  pendingCount: number;
  approvalPendingCount: number;
};

export function deriveCampaignMetrics(emails: CampaignEmailMetricInput[]): CampaignDerivedMetrics {
  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let pendingCount = 0;
  let approvalPendingCount = 0;

  for (const email of emails) {
    if (email.status === "sent") sentCount++;
    if (email.status === "failed") failedCount++;
    if (email.status === "skipped" || email.approvalStatus === "skipped") skippedCount++;
    if ((email.status === "generated" || email.status === "approved") && email.approvalStatus !== "skipped") pendingCount++;
    if (email.approvalStatus === "pending" && email.status === "generated") approvalPendingCount++;
  }

  return {
    sentCount,
    failedCount,
    skippedCount,
    pendingCount,
    approvalPendingCount,
  };
}
