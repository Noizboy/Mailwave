"use client";

import { MetricCard } from "@/components/shared/metric-card";
import type { ReportSummary } from "./report-types";

interface SummaryMetricsProps {
  summary: ReportSummary;
}

export function SummaryMetrics({ summary }: SummaryMetricsProps) {
  const metrics = [
    { label: "Emails Sent", value: summary.totalEmailsSent },
    { label: "Failed", value: summary.totalFailed },
    { label: "Opens", value: summary.totalOpened },
    { label: "Open Rate", value: `${summary.openRate}%` },
    { label: "Delivery Rate", value: `${summary.deliveryRate}%` },
    { label: "Total Campaigns", value: summary.totalCampaigns },
    { label: "Contacts", value: summary.totalContacts },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {metrics.map((m) => (
        <MetricCard key={m.label} label={m.label} value={m.value} />
      ))}
    </div>
  );
}
