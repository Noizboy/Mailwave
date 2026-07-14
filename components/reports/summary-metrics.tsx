"use client";

import { cn } from "@/lib/utils";
import { MetricCard } from "@/components/shared/metric-card";
import type { ReportSummary, EmailStats } from "./report-types";

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

interface EmailStatsChipsProps {
  stats: EmailStats;
}

export function EmailStatsChips({ stats }: EmailStatsChipsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <StatChip label="Sent" value={stats.sent} tone="success" />
      <StatChip label="Failed" value={stats.failed} tone="destructive" />
      <StatChip
        label="Queued"
        value={stats.pending + stats.generated}
        tone="info"
      />
      <StatChip label="Skipped" value={stats.skipped} tone="neutral" />
      <StatChip
        label="Total"
        value={
          stats.sent +
          stats.failed +
          stats.skipped +
          stats.pending +
          stats.generated
        }
        tone="neutral"
      />
    </div>
  );
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "destructive" | "info" | "neutral";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2",
        tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        tone === "destructive" && "border-destructive/30 bg-destructive/5 text-destructive",
        tone === "info" && "border-blue-200 bg-blue-50 text-blue-700",
        tone === "neutral" && "border-border bg-muted text-muted-foreground"
      )}
    >
      <div className="text-xl font-bold tabular-nums">{value.toLocaleString()}</div>
      <div className="text-xs font-medium">{label}</div>
    </div>
  );
}
