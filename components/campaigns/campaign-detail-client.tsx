"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Pencil,
  CheckCircle,
  MinusCircle,
  Edit3,
  Clock,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface ContactSnippet {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  jobTitle: string | null;
}

interface EmailRow {
  id: string;
  subject: string | null;
  body: string | null;
  personalizationNotes: string | null;
  approvalStatus: string;
  status: string;
  sentAt: string | null;
  contact: ContactSnippet;
}

interface CampaignEmail {
  status: string;
  sentAt: string | null;
}

interface CampaignDetail {
  id: string;
  name: string;
  status: string;
  totalEmails: number;
  sentCount: number;
  failedCount: number;
  pendingCount: number;
  skippedCount: number;
  list: { id: string; name: string };
  goal: string | null;
  product: string | null;
  cta: string | null;
  tone: string | null;
  language: string | null;
  emailLength: string | null;
  systemPrompt: string | null;
  aiProvider: string | null;
  aiModel: string | null;
  intervalType: string;
  minInterval: number;
  maxInterval: number;
  startedAt: string | null;
  createdAt: string;
  scheduledAt: string | null;
  emails: CampaignEmail[];
}

const DOT_COLOR: Record<string, string> = {
  approved: "bg-emerald-500",
  pending: "bg-amber-400",
  rejected: "bg-destructive",
  skipped: "bg-muted-foreground",
};

const TONE_LABELS: Record<string, string> = {
  professional: "Professional",
  friendly: "Friendly",
  "friendly & direct": "Friendly & direct",
  casual: "Casual",
  formal: "Formal",
  persuasive: "Persuasive",
};

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  es: "Spanish",
  "es-latam": "Spanish (LATAM)",
  pt: "Portuguese",
  fr: "French",
  de: "German",
  it: "Italian",
};

const EMAIL_LENGTH_LABELS: Record<string, string> = {
  short: "Short (60–100 words)",
  medium: "Medium (100–200 words)",
  long: "Long (200–350 words)",
};

function getNextEmailLabel(campaign: CampaignDetail): string | null {
  if (campaign.status !== "sending") return null;
  const sentEmails = campaign.emails.filter((e) => e.status === "sent" && e.sentAt);
  if (!sentEmails.length) return null;
  const lastSentMs = Math.max(...sentEmails.map((e) => new Date(e.sentAt!).getTime()));
  const avgInterval =
    campaign.intervalType === "random"
      ? Math.round((campaign.minInterval + campaign.maxInterval) / 2)
      : campaign.minInterval;
  const nextMs = lastSentMs + avgInterval * 60 * 1000;
  const diffMin = Math.round((nextMs - Date.now()) / 60000);
  if (diffMin <= 0) return "soon";
  if (diffMin < 60) return `~${diffMin} min`;
  return `~${Math.round(diffMin / 60)} hr`;
}

async function fetchCampaign(id: string): Promise<CampaignDetail> {
  const res = await fetch(`/api/campaigns/${id}`);
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

async function fetchEmails(campaignId: string): Promise<{ emails: EmailRow[]; total: number }> {
  const res = await fetch(`/api/campaigns/${campaignId}/emails?perPage=200`);
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

export function CampaignDetailClient({ campaignId }: { campaignId: string }) {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  // Email review state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [sidebarFilter, setSidebarFilter] = useState<string>("all");

  // Collapsible state for detail cards
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  // Campaign Details edit state
  const [editDetailsOpen, setEditDetailsOpen] = useState(false);
  const [detailsName, setDetailsName] = useState("");
  const [detailsGoal, setDetailsGoal] = useState("");
  const [detailsProduct, setDetailsProduct] = useState("");
  const [detailsCta, setDetailsCta] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);

  // AI Instructions edit state
  const [editAiOpen, setEditAiOpen] = useState(false);
  const [aiTone, setAiTone] = useState("");
  const [aiLanguage, setAiLanguage] = useState("");
  const [aiEmailLength, setAiEmailLength] = useState("");
  const [aiSystemPrompt, setAiSystemPrompt] = useState("");
  const [savingAi, setSavingAi] = useState(false);

  const { data: campaign, isLoading: campaignLoading } = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: () => fetchCampaign(campaignId),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && (data.status === "generating" || data.status === "sending")) return 5000;
      return false;
    },
  });

  const { data: emailsData, isLoading: emailsLoading } = useQuery({
    queryKey: ["campaign-emails", campaignId],
    queryFn: () => fetchEmails(campaignId),
    enabled: !!campaign,
    refetchInterval: campaign?.status === "generating" ? 3000 : false,
  });

  const emails = emailsData?.emails ?? [];
  const failedGenerationEmails = emails.filter((e) => e.status === "failed");
  const filteredEmails =
    sidebarFilter === "all"
      ? emails
      : sidebarFilter === "failed_gen"
      ? failedGenerationEmails
      : emails.filter((e) => e.approvalStatus === sidebarFilter);
  const selected = emails.find((e) => e.id === selectedId) ?? filteredEmails[0] ?? null;

  const approvedCount = emails.filter((e) => e.approvalStatus === "approved").length;
  const pendingCount = emails.filter((e) => e.approvalStatus === "pending").length;
  const rejectedCount = emails.filter((e) => e.approvalStatus === "rejected").length;
  const skippedCount = emails.filter((e) => e.approvalStatus === "skipped").length;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["campaign-emails", campaignId] });
  };

  const handleApproval = async (emailId: string, approvalStatus: string) => {
    const res = await fetch(`/api/campaigns/${campaignId}/emails/${emailId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalStatus }),
    });
    if (res.ok) {
      toast.success("Email status updated", `Marked as ${approvalStatus}.`);
      invalidate();
      const currentIdx = filteredEmails.findIndex((e) => e.id === emailId);
      const next = filteredEmails[currentIdx + 1];
      if (next) setSelectedId(next.id);
    } else {
      toast.error("Could not update email", "The approval status change was not saved. Try again.");
    }
  };

  const handleApproveAll = async () => {
    const res = await fetch(`/api/campaigns/${campaignId}/approve-all`, { method: "POST" });
    if (res.ok) {
      const { approved } = await res.json();
      toast.success(`${approved} email${approved === 1 ? "" : "s"} approved`, "Campaign is ready to send.");
      invalidate();
    }
  };

  const handleSend = async () => {
    const res = await fetch(`/api/campaigns/${campaignId}/send`, { method: "POST" });
    if (res.ok) {
      toast.success("Sending started", "Emails are being delivered. Monitor progress on this page.");
      invalidate();
    } else {
      const err = await res.json();
      toast.error("Could not start sending", err.error ?? "Check your SMTP settings and try again.");
    }
  };

  const handlePause = async () => {
    const res = await fetch(`/api/campaigns/${campaignId}/pause`, { method: "POST" });
    if (res.ok) {
      toast.success("Campaign paused", "No more emails will be sent until you resume.");
      invalidate();
    }
  };

  const handleRetryFailed = async () => {
    const res = await fetch(`/api/campaigns/${campaignId}/retry-failed`, { method: "POST" });
    if (res.ok) {
      const { retried } = await res.json();
      toast.success("Retrying failed emails", `${retried} email${retried === 1 ? "" : "s"} queued for retry.`);
      invalidate();
    } else {
      const err = await res.json();
      toast.error("Retry failed", err.error ?? "Could not retry failed emails.");
    }
  };

  const handleCancel = async () => {
    const res = await fetch(`/api/campaigns/${campaignId}/cancel`, { method: "POST" });
    if (res.ok) {
      toast.success("Campaign reset", "Failed emails have been reset. You can now re-send the campaign.");
      invalidate();
    } else {
      const err = await res.json();
      toast.error("Could not cancel", err.error ?? "An error occurred.");
    }
  };

  const handleGenerate = async (mode?: "retry_failed") => {
    const res = await fetch(`/api/campaigns/${campaignId}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode ? { mode } : {}),
    });
    if (res.ok) {
      const msg = mode === "retry_failed" ? "Retrying failed emails" : "Generating emails";
      toast.success(msg, "AI is personalizing each email. This may take a few minutes.");
      invalidate();
    } else {
      const err = await res.json();
      toast.error("Generation failed", err.error ?? "Check your AI settings and try again.");
    }
  };

  const handleRegenerate = async () => {
    if (!selected) return;
    setRegenerating(true);
    const res = await fetch(
      `/api/campaigns/${campaignId}/emails/${selected.id}/regenerate`,
      { method: "POST" }
    );
    if (res.ok) {
      toast.success("Email regenerated", "A new version has been created using AI.");
      invalidate();
    } else {
      const err = await res.json();
      toast.error("Regeneration failed", err.error ?? "Check your AI settings and try again.");
    }
    setRegenerating(false);
  };

  const openEdit = () => {
    if (!selected) return;
    setEditSubject(selected.subject ?? "");
    setEditBody(selected.body ?? "");
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setEditSubject("");
    setEditBody("");
  };

  const saveEdit = async (andApprove = false) => {
    if (!selected) return;
    setSaving(true);
    const res = await fetch(`/api/campaigns/${campaignId}/emails/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: editSubject,
        body: editBody,
        ...(andApprove ? { approvalStatus: "approved" } : {}),
      }),
    });
    if (res.ok) {
      toast.success(
        andApprove ? "Saved and approved" : "Changes saved",
        andApprove ? "Email updated and marked as approved." : "Your edits have been saved to this email."
      );
      setEditMode(false);
      invalidate();
    } else {
      toast.error("Could not save changes", "Your edits were not saved. Try again.");
    }
    setSaving(false);
  };

  const openEditDetails = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!campaign) return;
    setDetailsName(campaign.name);
    setDetailsGoal(campaign.goal ?? "");
    setDetailsProduct(campaign.product ?? "");
    setDetailsCta(campaign.cta ?? "");
    setEditDetailsOpen(true);
  };

  const saveDetails = async () => {
    setSavingDetails(true);
    const res = await fetch(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: detailsName || undefined,
        goal: detailsGoal || undefined,
        product: detailsProduct || undefined,
        cta: detailsCta || undefined,
      }),
    });
    if (res.ok) {
      toast.success("Campaign saved", "Campaign details have been updated.");
      setEditDetailsOpen(false);
      invalidate();
    }
    setSavingDetails(false);
  };

  const openEditAi = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!campaign) return;
    setAiTone(campaign.tone ?? "");
    setAiLanguage(campaign.language ?? "");
    setAiEmailLength(campaign.emailLength ?? "");
    setAiSystemPrompt(campaign.systemPrompt ?? "");
    setEditAiOpen(true);
  };

  const saveAi = async () => {
    setSavingAi(true);
    const res = await fetch(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tone: aiTone || undefined,
        language: aiLanguage || undefined,
        emailLength: aiEmailLength || undefined,
        systemPrompt: aiSystemPrompt || undefined,
      }),
    });
    if (res.ok) {
      toast.success("AI instructions saved", "Campaign instructions have been updated.");
      setEditAiOpen(false);
      invalidate();
    }
    setSavingAi(false);
  };

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

  const canGenerate = ["pending", "failed", "completed"].includes(campaign.status);
  const canRetryGeneration = campaign.status === "pending_review" && campaign.failedCount > 0;
  const canRegenerate = ["pending_review", "ready_to_send"].includes(campaign.status) && campaign.failedCount === 0;
  const canApprove = campaign.status === "pending_review";
  const canSend = ["ready_to_send", "paused"].includes(campaign.status);
  const canPause = campaign.status === "sending";
  const isGenerating = campaign.status === "generating";
  const hasFailures = campaign.failedCount > 0 && ["sending", "paused", "completed"].includes(campaign.status);

  const FILTER_TABS = [
    { key: "all", label: `All (${emails.length})` },
    { key: "pending", label: `Pending (${pendingCount})` },
    { key: "approved", label: `Approved (${approvedCount})` },
    { key: "rejected", label: `Rejected (${rejectedCount})` },
    { key: "skipped", label: `Skipped (${skippedCount})` },
    { key: "failed_gen", label: `Failed (${failedGenerationEmails.length})` },
  ];

  const percent =
    campaign.totalEmails > 0
      ? Math.round((campaign.sentCount / campaign.totalEmails) * 100)
      : 0;

  const generatedCount = campaign.emails.filter((e) => e.status === "generated").length;
  const generationPercent =
    campaign.totalEmails > 0
      ? Math.round((generatedCount / campaign.totalEmails) * 100)
      : 0;

  const nextEmailLabel = getNextEmailLabel(campaign);

  const stats: Array<{ label: string; value: number; tone: "neutral" | "success" | "destructive" | "warning" }> = [
    { label: "Total Emails", value: campaign.totalEmails, tone: "neutral" },
    { label: "Sent", value: campaign.sentCount, tone: "success" },
    { label: "Failed", value: campaign.failedCount, tone: "destructive" },
    { label: "Pending", value: pendingCount, tone: "warning" },
    { label: "Skipped", value: campaign.skippedCount, tone: "neutral" },
  ];

  return (
    <div className="flex flex-col h-full">
      <TopBar title={campaign.name} />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="space-y-6">

          {/* Campaign action bar */}
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={campaign.status} />
            <div className="flex-1" />
            {isGenerating ? (
              <Button size="sm" disabled variant="outline">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Generating...
              </Button>
            ) : (
              <>
                {canRetryGeneration && (
                  <Button size="sm" onClick={() => handleGenerate("retry_failed")} variant="outline">
                    <RotateCcw className="h-4 w-4" />
                    Retry Failed
                  </Button>
                )}
                {canRegenerate && (
                  <Button size="sm" onClick={() => handleGenerate()} variant="outline">
                    <RefreshCw className="h-4 w-4" />
                    Re-Generate Emails
                  </Button>
                )}
                {canApprove && (
                  <Button size="sm" onClick={handleApproveAll} variant="outline">
                    <CheckCheck className="h-4 w-4" />
                    Approve All
                  </Button>
                )}
                {canSend && (
                  <Button size="sm" onClick={handleSend}>
                    <Play className="h-4 w-4" />
                    {campaign.status === "paused" ? "Resume Sending" : "Send Campaign"}
                  </Button>
                )}
                {canPause && (
                  <Button size="sm" onClick={handlePause} variant="outline">
                    <Pause className="h-4 w-4" />
                    Pause
                  </Button>
                )}
                {hasFailures && (
                  <Button size="sm" onClick={handleRetryFailed} variant="outline">
                    <RotateCcw className="h-4 w-4" />
                    Retry Failed
                  </Button>
                )}
                {hasFailures && (
                  <Button size="sm" onClick={handleCancel} variant="destructive">
                    <XCircle className="h-4 w-4" />
                    Cancel
                  </Button>
                )}
              </>
            )}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {stats.map((s) => (
              <StatChip key={s.label} label={s.label} value={s.value} tone={s.tone} />
            ))}
          </div>

          {/* Generation progress */}
          {isGenerating && (
            <div className="rounded-xl border bg-card px-5 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm font-semibold text-foreground">Generating emails…</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {generatedCount} / {campaign.totalEmails} generated
                </span>
              </div>
              <Progress value={generationPercent} className="h-3" />
              <p className="text-xs text-muted-foreground">
                AI is personalizing each email. This page refreshes automatically every few seconds.
              </p>
            </div>
          )}

          {/* Sending progress bar */}
          {!isGenerating && campaign.totalEmails > 0 && (
            <div className="rounded-xl border bg-card px-5 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Sending progress</span>
                <span className="text-sm text-muted-foreground">
                  {percent}%{nextEmailLabel ? ` · next email in ${nextEmailLabel}` : ""}
                </span>
              </div>
              <Progress value={percent} className="h-3" />
            </div>
          )}

          {/* Collapsible Campaign Details */}
          <div className="rounded-xl border bg-card">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setDetailsOpen((v) => !v)}
              onKeyDown={(e) => e.key === "Enter" && setDetailsOpen((v) => !v)}
              className="flex w-full cursor-pointer items-center justify-between px-5 py-4 select-none"
            >
              <span className="text-sm font-semibold text-foreground">Campaign Details</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openEditDetails}
                  className="h-7 text-xs"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </Button>
                {detailsOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
            {detailsOpen && (
              <div className="border-t px-5 py-4 space-y-4">
                <InfoField label="LIST">
                  <Link href={`/lists/${campaign.list.id}`} className="text-primary hover:underline">
                    {campaign.list.name}
                  </Link>
                </InfoField>
                <InfoField label="GOAL">{campaign.goal || "—"}</InfoField>
                <InfoField label="PRODUCT">{campaign.product || "—"}</InfoField>
                <InfoField label="CTA">{campaign.cta || "—"}</InfoField>
                <InfoField label="CREATED">
                  {new Date(campaign.createdAt).toLocaleDateString()}
                </InfoField>
                {campaign.scheduledAt && (
                  <InfoField label="SCHEDULED">
                    {new Date(campaign.scheduledAt).toLocaleString()}
                  </InfoField>
                )}
              </div>
            )}
          </div>

          {/* Collapsible AI Instructions */}
          <div className="rounded-xl border bg-card">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setAiOpen((v) => !v)}
              onKeyDown={(e) => e.key === "Enter" && setAiOpen((v) => !v)}
              className="flex w-full cursor-pointer items-center justify-between px-5 py-4 select-none"
            >
              <span className="text-sm font-semibold text-foreground">AI Instructions</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openEditAi}
                  className="h-7 text-xs"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </Button>
                {aiOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
            {aiOpen && (
              <div className="border-t px-5 py-4 space-y-4">
                <InfoField label="TONE">
                  {TONE_LABELS[campaign.tone ?? ""] ?? campaign.tone ?? "Professional"}
                </InfoField>
                <InfoField label="LANGUAGE">
                  {LANGUAGE_LABELS[campaign.language ?? ""] ?? campaign.language ?? "English"}
                </InfoField>
                <InfoField label="EMAIL LENGTH">
                  {EMAIL_LENGTH_LABELS[campaign.emailLength ?? ""] ?? campaign.emailLength ?? "Medium (100–200 words)"}
                </InfoField>
                {campaign.aiProvider && (
                  <InfoField label="AI PROVIDER">{campaign.aiProvider}</InfoField>
                )}
                {campaign.aiModel && (
                  <InfoField label="MODEL">{campaign.aiModel}</InfoField>
                )}
                {campaign.systemPrompt && (
                  <InfoField label="SYSTEM PROMPT">
                    <div className="max-h-36 overflow-y-auto rounded-md border bg-muted/40 p-2 text-xs leading-relaxed text-foreground/80">
                      <p className="whitespace-pre-wrap">{campaign.systemPrompt}</p>
                    </div>
                  </InfoField>
                )}
              </div>
            )}
          </div>

          {/* Generated Emails — split review view */}
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between border-b pb-3">
              <CardTitle>Generated Emails</CardTitle>
              <div className="flex items-center gap-3">
                {emails.length > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {approvedCount}/{emails.length} approved
                  </span>
                )}
                {canGenerate && !isGenerating && (
                  <Button size="sm" onClick={() => handleGenerate()}>
                    <Play className="h-4 w-4" />
                    {campaign.status === "completed" ? "Re-Generate Emails" : "Generate Emails"}
                  </Button>
                )}
              </div>
            </CardHeader>
            <div className="flex h-[650px] overflow-hidden">
              {/* Left sidebar — contact list */}
              <aside className="flex w-80 shrink-0 flex-col border-r bg-background">
                <div className="overflow-x-auto border-b">
                  <Tabs value={sidebarFilter} onValueChange={setSidebarFilter} className="px-2 pt-2">
                    <TabsList>
                      {FILTER_TABS.map((t) => (
                        <TabsTrigger key={t.key} value={t.key}>
                          {t.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {emailsLoading ? (
                    <div className="space-y-2 p-4">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-10 w-full" />
                      ))}
                    </div>
                  ) : filteredEmails.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      {isGenerating
                        ? "Emails will appear here as they are generated."
                        : campaign.status === "pending"
                        ? "Click 'Generate Emails' to create drafts."
                        : "No emails match this filter."}
                    </div>
                  ) : (
                    filteredEmails.map((email) => {
                      const isSelected = (selectedId ?? filteredEmails[0]?.id) === email.id;
                      const name =
                        [email.contact.firstName, email.contact.lastName]
                          .filter(Boolean)
                          .join(" ") || email.contact.email;
                      return (
                        <button
                          key={email.id}
                          onClick={() => {
                            setSelectedId(email.id);
                            setEditMode(false);
                          }}
                          className={cn(
                            "flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors",
                            isSelected ? "bg-accent" : "hover:bg-muted/40"
                          )}
                        >
                          <span
                            className={cn(
                              "h-2.5 w-2.5 shrink-0 rounded-full",
                              DOT_COLOR[email.approvalStatus] ?? "bg-muted-foreground"
                            )}
                          />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-foreground">{name}</div>
                            {(email.contact.firstName || email.contact.lastName) && (
                              <div className="truncate text-xs text-muted-foreground">
                                {email.contact.email}
                              </div>
                            )}
                            {email.contact.company && (
                              <div className="truncate text-xs text-muted-foreground">
                                {email.contact.company}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </aside>

              {/* Right panel */}
              <main className="flex-1 overflow-y-auto bg-muted/30">
                {!selected ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    {emails.length === 0
                      ? campaign.status === "pending"
                        ? "Generate emails to start reviewing."
                        : "No emails yet."
                      : "Select a contact to preview the email."}
                  </div>
                ) : (
                  <div className="space-y-4 p-6">
                    {/* Contact info — clickable link */}
                    <Card className="flex items-start justify-between p-4">
                      <Link
                        href={`/contacts?q=${encodeURIComponent(selected.contact.email)}`}
                        className="group min-w-0"
                      >
                        <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                          {[selected.contact.firstName, selected.contact.lastName]
                            .filter(Boolean)
                            .join(" ") || selected.contact.email}
                        </div>
                        {(selected.contact.firstName || selected.contact.lastName) && (
                          <div className="text-xs text-muted-foreground">{selected.contact.email}</div>
                        )}
                        {selected.contact.company && (
                          <div className="text-xs text-muted-foreground">
                            {selected.contact.jobTitle ? `${selected.contact.jobTitle} · ` : ""}
                            {selected.contact.company}
                          </div>
                        )}
                      </Link>
                      <StatusBadge status={selected.approvalStatus} />
                    </Card>

                    {selected.personalizationNotes && !editMode && (
                      <div className="rounded-lg bg-blue-50 px-4 py-2.5 text-xs text-blue-700">
                        <strong>AI notes:</strong> {selected.personalizationNotes}
                      </div>
                    )}

                    {/* Preview / edit */}
                    {editMode ? (
                      <Card className="space-y-4 p-4">
                        <div className="space-y-1.5">
                          <Label>Subject</Label>
                          <Input
                            value={editSubject}
                            onChange={(e) => setEditSubject(e.target.value)}
                            className="font-medium"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Body</Label>
                          <Textarea
                            value={editBody}
                            onChange={(e) => setEditBody(e.target.value)}
                            rows={18}
                            className="font-mono text-xs leading-relaxed"
                          />
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button onClick={() => saveEdit(true)} disabled={saving} className="flex-1">
                            <CheckCircle className="h-4 w-4" />
                            Save &amp; Approve
                          </Button>
                          <Button variant="outline" onClick={() => saveEdit(false)} disabled={saving}>
                            Save
                          </Button>
                          <Button variant="destructive" onClick={cancelEdit} disabled={saving}>
                            Cancel
                          </Button>
                        </div>
                      </Card>
                    ) : (
                      <Card className="space-y-3 p-4">
                        <div className="flex items-center gap-2">
                          <span className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Subject
                          </span>
                          <p className="text-sm font-semibold text-foreground">
                            {selected.subject ?? (
                              <em className="font-normal text-muted-foreground">No subject</em>
                            )}
                          </p>
                        </div>
                        <Separator />
                        <div>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                            {selected.body ?? <em className="text-muted-foreground">No body</em>}
                          </p>
                        </div>
                      </Card>
                    )}

                    {/* Actions */}
                    {!editMode && (
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={openEdit}>
                          <Edit3 className="h-4 w-4" />
                          Edit Email
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRegenerate}
                          disabled={regenerating}
                        >
                          <RefreshCw className={cn("h-4 w-4", regenerating && "animate-spin")} />
                          {regenerating ? "Regenerating..." : "Regenerate Email"}
                        </Button>
                        {selected.approvalStatus !== "skipped" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleApproval(selected.id, "skipped")}
                            className="text-muted-foreground"
                          >
                            <MinusCircle className="h-4 w-4" />
                            Skip Contact
                          </Button>
                        )}
                        {selected.approvalStatus !== "rejected" && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleApproval(selected.id, "rejected")}
                          >
                            <XCircle className="h-4 w-4" />
                            Reject
                          </Button>
                        )}
                        {selected.approvalStatus !== "approved" && (
                          <Button
                            size="sm"
                            variant="success"
                            onClick={() => handleApproval(selected.id, "approved")}
                            className="ml-auto"
                          >
                            <CheckCircle className="h-4 w-4" />
                            Approve
                          </Button>
                        )}
                        {selected.approvalStatus === "approved" && (
                          <div className="ml-auto flex items-center gap-1.5 text-sm text-emerald-600">
                            <CheckCircle className="h-4 w-4" />
                            Approved
                          </div>
                        )}
                      </div>
                    )}

                    {selected.status === "sent" && selected.sentAt && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        Sent {new Date(selected.sentAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                )}
              </main>
            </div>
          </Card>

          {/* Edit Campaign Details sheet */}
          <Sheet open={editDetailsOpen} onOpenChange={setEditDetailsOpen}>
            <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
              <SheetHeader className="border-b p-6">
                <SheetTitle>Edit Campaign Details</SheetTitle>
                <SheetDescription>Update the campaign name, goal, product, and CTA.</SheetDescription>
              </SheetHeader>
              <div className="flex-1 space-y-5 overflow-y-auto p-6">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={detailsName} onChange={(e) => setDetailsName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Goal</Label>
                  <Textarea
                    value={detailsGoal}
                    onChange={(e) => setDetailsGoal(e.target.value)}
                    placeholder="e.g. Book a demo call"
                    rows={3}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Product</Label>
                  <Input
                    value={detailsProduct}
                    onChange={(e) => setDetailsProduct(e.target.value)}
                    placeholder="e.g. Mailwave — cold email platform"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>CTA</Label>
                  <Input
                    value={detailsCta}
                    onChange={(e) => setDetailsCta(e.target.value)}
                    placeholder="e.g. Reply to this email to schedule a call"
                  />
                </div>
              </div>
              <div className="border-t p-6">
                <Button onClick={saveDetails} disabled={savingDetails} className="w-full">
                  {savingDetails ? "Saving..." : "Save Details"}
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          {/* Edit AI Instructions sheet */}
          <Sheet open={editAiOpen} onOpenChange={setEditAiOpen}>
            <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
              <SheetHeader className="border-b p-6">
                <SheetTitle>Edit AI Instructions</SheetTitle>
                <SheetDescription>Adjust how AI generates emails for this campaign.</SheetDescription>
              </SheetHeader>
              <div className="flex-1 space-y-5 overflow-y-auto p-6">
                <div className="space-y-1.5">
                  <Label>Tone</Label>
                  <Select value={aiTone} onValueChange={setAiTone}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select tone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="friendly">Friendly</SelectItem>
                      <SelectItem value="friendly & direct">Friendly &amp; direct</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="formal">Formal</SelectItem>
                      <SelectItem value="persuasive">Persuasive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Language</Label>
                  <Select value={aiLanguage} onValueChange={setAiLanguage}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="es-latam">Spanish (LATAM)</SelectItem>
                      <SelectItem value="pt">Portuguese</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                      <SelectItem value="de">German</SelectItem>
                      <SelectItem value="it">Italian</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Email Length</Label>
                  <Select value={aiEmailLength} onValueChange={setAiEmailLength}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select length" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short">Short (60–100 words)</SelectItem>
                      <SelectItem value="medium">Medium (100–200 words)</SelectItem>
                      <SelectItem value="long">Long (200–350 words)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Separator />
                <div className="space-y-1.5">
                  <Label>System Prompt</Label>
                  <p className="text-xs text-muted-foreground">Optional. Override or extend the default AI behavior with your own rules.</p>
                  <Textarea
                    value={aiSystemPrompt}
                    onChange={(e) => setAiSystemPrompt(e.target.value)}
                    placeholder="e.g. Always open with a reference to the recipient's industry. Never use the phrase 'I hope this email finds you well'."
                    rows={8}
                    className="resize-none overflow-y-auto"
                  />
                </div>
              </div>
              <div className="border-t p-6">
                <Button onClick={saveAi} disabled={savingAi} className="w-full">
                  {savingAi ? "Saving..." : "Save Instructions"}
                </Button>
              </div>
            </SheetContent>
          </Sheet>

        </div>
      </main>
    </div>
  );
}

function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <div className="text-sm text-foreground">{children}</div>
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
  tone: "neutral" | "success" | "destructive" | "warning";
}) {
  return (
    <div className="rounded-xl border bg-card px-5 py-4 shadow-sm">
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1.5 text-2xl font-bold tabular-nums",
          tone === "neutral" && "text-foreground",
          tone === "success" && "text-emerald-600",
          tone === "destructive" && "text-destructive",
          tone === "warning" && "text-amber-500"
        )}
      >
        {value}
      </div>
    </div>
  );
}
