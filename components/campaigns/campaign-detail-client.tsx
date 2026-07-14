"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CreateCampaignWizard } from "@/components/campaigns/create-campaign-wizard";
import { TopBar } from "@/components/layout/topbar";
import {
  Play,
  Pause,
  CheckCheck,
  RefreshCw,
  RotateCcw,
  XCircle,
  Send,
  Mail,
  AlertTriangle,
  Clock,
  MinusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";
import {
  CampaignDetail,
  EmailRow,
  getNextEmailLabel,
} from "./campaign-types";
import { CampaignDetailsPanel } from "./campaign-config-panels";
import { AiInstructionsPanel } from "./campaign-config-panels";
import { SendingConfigPanel } from "./campaign-config-panels";
import { EmailReview } from "./email-review";
import { useCampaignActions } from "./use-campaign-actions";

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

async function fetchCampaign(id: string): Promise<CampaignDetail> {
  const res = await fetch(`/api/campaigns/${id}`);
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

async function fetchEmails(
  campaignId: string
): Promise<{ emails: EmailRow[]; total: number }> {
  const res = await fetch(`/api/campaigns/${campaignId}/emails?perPage=200`);
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

// ---------------------------------------------------------------------------
// StatChip
// ---------------------------------------------------------------------------

function StatChip({
  label,
  value,
  tone,
  icon,
  iconBg,
}: {
  label: string;
  value: number;
  tone: "neutral" | "success" | "destructive" | "warning";
  icon: React.ReactNode;
  iconBg: string;
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-4 shadow-sm flex items-center gap-3">
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
          iconBg
        )}
      >
        {icon}
      </div>
      <div>
        <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div
          className={cn(
            "mt-0.5 text-2xl font-bold tabular-nums",
            tone === "neutral" && "text-foreground",
            tone === "success" && "text-emerald-600",
            tone === "destructive" && "text-destructive",
            tone === "warning" && "text-amber-500"
          )}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CampaignDetailClient
// ---------------------------------------------------------------------------

export function CampaignDetailClient({ campaignId }: { campaignId: string }) {
  const searchParams = useSearchParams();
  const [nowMs, setNowMs] = useState(() => Date.now());

  const {
    cancellingGenerate,
    approveAll: handleApproveAll,
    send: handleSendAction,
    pause: handlePause,
    retryFailed: handleRetryFailed,
    cancel: handleCancel,
    cancelGenerate: handleCancelGenerate,
    generate: handleGenerate,
  } = useCampaignActions(campaignId);

  const { data: campaign, isLoading: campaignLoading } = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: () => fetchCampaign(campaignId),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (
        data &&
        (data.status === "generating" || data.status === "sending")
      )
        return 5000;
      return false;
    },
  });

  const { data: emailsData, isLoading: emailsLoading } = useQuery({
    queryKey: ["campaign-emails", campaignId],
    queryFn: () => fetchEmails(campaignId),
    enabled: !!campaign,
    refetchInterval:
      campaign?.status === "generating" || campaign?.status === "sending"
        ? 3000
        : false,
  });

  useEffect(() => {
    if (campaign?.status !== "sending") return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [campaign?.status]);

  const emails = emailsData?.emails ?? [];

  // ---- Loading / error states ----

  if (campaignLoading || !campaign) {
    return (
      <div className="flex flex-col h-full">
        <TopBar title="Campaign" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            <Skeleton className="h-12 w-1/2" />
            <div className="flex gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-24 flex-1" />
              ))}
            </div>
            <Skeleton className="h-64" />
          </div>
        </main>
      </div>
    );
  }

  if (campaign.status === "pending" && searchParams.get("wizard") === "1") {
    return (
      <CreateCampaignWizard
        campaign={{
          id: campaign.id,
          name: campaign.name,
          listId: campaign.list.id,
          goal: campaign.goal,
          product: campaign.product,
          cta: campaign.cta,
          tone: campaign.tone,
          language: campaign.language,
          emailLength: campaign.emailLength,
          systemPrompt: campaign.systemPrompt,
          intervalType: campaign.intervalType,
          minInterval: campaign.minInterval,
          maxInterval: campaign.maxInterval,
          scheduledAt: campaign.scheduledAt,
          aiProvider: campaign.aiProvider,
          aiModel: campaign.aiModel,
        }}
      />
    );
  }

  // ---- Derived state ----

  const reviewPendingCount = emails.filter(
    (e) => e.approvalStatus === "pending"
  ).length;
  const rejectedCount = emails.filter(
    (e) => e.approvalStatus === "rejected"
  ).length;
  const approvedCount = emails.filter(
    (e) => e.approvalStatus === "approved"
  ).length;
  const sendPendingCount = campaign.pendingCount;

  const canGenerate = ["pending", "failed"].includes(campaign.status);
  const canRetryGeneration =
    campaign.status === "pending_review" && campaign.failedCount > 0;
  const canRegenerate =
    ["pending_review", "ready_to_send"].includes(campaign.status) &&
    campaign.failedCount === 0;
  const allReviewed =
    emails.length > 0 &&
    campaign.status === "pending_review" &&
    reviewPendingCount === 0 &&
    rejectedCount === 0 &&
    approvedCount > 0;
  const canApprove = campaign.status === "pending_review" && !allReviewed;
  const canSend =
    ["ready_to_send", "paused"].includes(campaign.status) || allReviewed;
  const canPause = campaign.status === "sending";
  const isGenerating = campaign.status === "generating";
  const hasFailures =
    campaign.failedCount > 0 &&
    ["sending", "paused"].includes(campaign.status);

  const sendableEmails = campaign.totalEmails - campaign.skippedCount;
  const percent =
    sendableEmails > 0
      ? Math.round(
          ((campaign.sentCount + campaign.failedCount) / sendableEmails) * 100
        )
      : 0;

  const generatedCount = campaign.emails.filter(
    (e) => e.status === "generated"
  ).length;
  const generationPercent =
    campaign.totalEmails > 0
      ? Math.round((generatedCount / campaign.totalEmails) * 100)
      : 0;

  const nextEmailLabel = getNextEmailLabel(campaign, nowMs);

  const stats: Array<{
    label: string;
    value: number;
    tone: "neutral" | "success" | "destructive" | "warning";
    icon: React.ReactNode;
    iconBg: string;
  }> = [
    {
      label: "Total Emails",
      value: campaign.totalEmails,
      tone: "neutral",
      icon: <Mail className="h-5 w-5 text-blue-600" />,
      iconBg: "bg-blue-100",
    },
    {
      label: "Sent",
      value: campaign.sentCount,
      tone: "success",
      icon: <Send className="h-5 w-5 text-emerald-600" />,
      iconBg: "bg-emerald-100",
    },
    {
      label: "Failed",
      value: campaign.failedCount,
      tone: "destructive",
      icon: <AlertTriangle className="h-5 w-5 text-red-500" />,
      iconBg: "bg-red-100",
    },
    {
      label: "Queued",
      value: sendPendingCount,
      tone: "warning",
      icon: <Clock className="h-5 w-5 text-amber-500" />,
      iconBg: "bg-amber-100",
    },
    {
      label: "Skipped",
      value: campaign.skippedCount,
      tone: "neutral",
      icon: <MinusCircle className="h-5 w-5 text-muted-foreground" />,
      iconBg: "bg-muted",
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <TopBar title={campaign.name} />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="space-y-5">

          {/* Breadcrumb + title + actions */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              <Link
                href="/campaigns"
                className="hover:text-foreground transition-colors"
              >
                Campaigns
              </Link>
            </p>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  {campaign.name}
                </h1>
                <div className="mt-2">
                  <StatusBadge status={campaign.status} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {isGenerating ? (
                  <Button size="sm" disabled variant="outline">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Generating...
                  </Button>
                ) : (
                  <>
                    {canGenerate && (
                      <Button size="sm" onClick={() => handleGenerate()}>
                        <Play className="h-4 w-4" />
                        {campaign.status === "completed"
                          ? "Re-Generate Emails"
                          : "Generate Emails"}
                      </Button>
                    )}
                    {canRetryGeneration && (
                      <Button
                        size="sm"
                        onClick={() => handleGenerate("retry_failed")}
                        variant="outline"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Retry Failed
                      </Button>
                    )}
                    {canRegenerate && (
                      <Button
                        size="sm"
                        onClick={() => handleGenerate()}
                        variant="outline"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Re-Generate Emails
                      </Button>
                    )}
                    {canApprove && (
                      <Button size="sm" onClick={handleApproveAll}>
                        <CheckCheck className="h-4 w-4" />
                        Approve All
                      </Button>
                    )}
                    {canSend && (
                      <Button size="sm" onClick={() => handleSendAction(allReviewed)}>
                        <Play className="h-4 w-4" />
                        {campaign.status === "paused"
                          ? "Resume Sending"
                          : "Send Campaign"}
                      </Button>
                    )}
                    {canPause && (
                      <Button
                        size="sm"
                        onClick={handlePause}
                        variant="outline"
                      >
                        <Pause className="h-4 w-4" />
                        Pause
                      </Button>
                    )}
                    {hasFailures && (
                      <Button
                        size="sm"
                        onClick={handleRetryFailed}
                        variant="outline"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Retry Failed
                      </Button>
                    )}
                    {hasFailures && (
                      <Button
                        size="sm"
                        onClick={handleCancel}
                        variant="destructive"
                      >
                        <XCircle className="h-4 w-4" />
                        Cancel
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {stats.map((s) => (
              <StatChip
                key={s.label}
                label={s.label}
                value={s.value}
                tone={s.tone}
                icon={s.icon}
                iconBg={s.iconBg}
              />
            ))}
          </div>

          {/* Generation failed banner */}
          {campaign.status === "failed" && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4 flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-destructive">
                  Generation failed
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  The AI service returned an error or no eligible contacts were
                  found. Check your AI settings and try again.
                </p>
              </div>
            </div>
          )}

          {/* Generation progress */}
          {isGenerating && (
            <div className="rounded-xl border bg-card px-5 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm font-semibold text-foreground">
                    Generating emails…
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {generatedCount} / {campaign.totalEmails}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancelGenerate}
                  disabled={cancellingGenerate}
                >
                  <XCircle className="h-4 w-4" />
                  Cancel
                </Button>
              </div>
              <Progress value={generationPercent} className="h-2" />
              <p className="text-xs text-muted-foreground">
                AI is personalizing each email. This page refreshes
                automatically every few seconds.
              </p>
            </div>
          )}

          {/* Sending progress */}
          {["sending", "paused", "completed"].includes(campaign.status) &&
            campaign.totalEmails > 0 && (
              <div className="rounded-xl border bg-card px-5 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {campaign.status === "sending" && (
                      <Send className="h-4 w-4 animate-pulse text-primary" />
                    )}
                    {campaign.status === "paused" && (
                      <Pause className="h-4 w-4 text-muted-foreground" />
                    )}
                    {campaign.status === "completed" && (
                      <CheckCheck className="h-4 w-4 text-green-600" />
                    )}
                    <span className="text-sm font-semibold text-foreground">
                      {campaign.status === "completed"
                        ? "Sending complete"
                        : campaign.status === "paused"
                        ? "Sending paused"
                        : "Sending emails…"}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {campaign.sentCount} / {sendableEmails} sent
                  </span>
                </div>
                <Progress value={percent} className="h-2" />
                {nextEmailLabel && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {nextEmailLabel === "Sending now" ? (
                      <>
                        <span className="relative flex h-2 w-2 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                        </span>
                        <span>Sending now</span>
                      </>
                    ) : (
                      <>
                        <Clock className="h-3 w-3 shrink-0" />
                        <span>{nextEmailLabel}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

          {/* Configuration panels */}
          <CampaignDetailsPanel
            campaign={campaign}
            campaignId={campaignId}
            onSaved={() => {}}
          />
          <AiInstructionsPanel
            campaign={campaign}
            campaignId={campaignId}
            onSaved={() => {}}
          />
          <SendingConfigPanel
            campaign={campaign}
            campaignId={campaignId}
            onSaved={() => {}}
          />

          {/* Email review */}
          <EmailReview
            campaign={campaign}
            campaignId={campaignId}
            emails={emails}
            emailsLoading={emailsLoading}
            onInvalidate={() => {}}
          />

        </div>
      </main>
    </div>
  );
}
