"use client";

import { useEffect, useState } from "react";
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
  ChevronLeft,
  Send,
  Eye,
  Mail,
  AlertTriangle,
  FileText,
  Sparkles,
  SlidersHorizontal,
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  status: string | null;
}

interface EmailRow {
  id: string;
  subject: string | null;
  body: string | null;
  personalizationNotes: string | null;
  approvalStatus: string;
  status: string;
  sentAt: string | null;
  opened?: boolean;
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
  nextSendAt: string | null;
  updatedAt: string;
  createdAt: string;
  scheduledAt: string | null;
  emails: CampaignEmail[];
}

const AVATAR_COLORS = [
  "bg-blue-600",
  "bg-emerald-600",
  "bg-orange-500",
  "bg-violet-600",
  "bg-teal-600",
  "bg-rose-500",
  "bg-amber-600",
  "bg-cyan-600",
  "bg-indigo-600",
  "bg-pink-600",
];

function getAvatarColor(name: string): string {
  const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function getContactInitials(contact: ContactSnippet): string {
  if (contact.firstName && contact.lastName) {
    return (contact.firstName[0] + contact.lastName[0]).toUpperCase();
  }
  if (contact.firstName) return contact.firstName.slice(0, 2).toUpperCase();
  return contact.email.slice(0, 2).toUpperCase();
}

function getContactName(contact: ContactSnippet): string {
  return (
    [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
    contact.email
  );
}

const EMAIL_DOT: Record<string, { bg: string; icon: React.ReactNode }> = {
  approved: {
    bg: "bg-blue-500",
    icon: <CheckCircle className="h-3 w-3 text-white" />,
  },
  pending: {
    bg: "bg-amber-400",
    icon: <Clock className="h-3 w-3 text-white" />,
  },
  rejected: {
    bg: "bg-destructive",
    icon: <XCircle className="h-3 w-3 text-white" />,
  },
  skipped: {
    bg: "bg-muted-foreground",
    icon: <MinusCircle className="h-3 w-3 text-white" />,
  },
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
  pt: "Portuguese",
  fr: "French",
  de: "German",
};

const EMAIL_LENGTH_LABELS: Record<string, string> = {
  "very-short": "Very Short (under 50 words)",
  short: "Short (60–100 words)",
  medium: "Medium (100–200 words)",
  long: "Long (200–350 words)",
};

function formatCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.ceil(msRemaining / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

function getNextEmailLabel(campaign: CampaignDetail, nowMs: number): string | null {
  if (campaign.status !== "sending") return null;
  // No more emails to process — don't show a countdown
  const processed = campaign.sentCount + campaign.failedCount + campaign.skippedCount;
  if (processed >= campaign.totalEmails) return null;
  if (campaign.nextSendAt) {
    const remainingMs = new Date(campaign.nextSendAt).getTime() - nowMs;
    return remainingMs > 0 ? formatCountdown(remainingMs) : "Sending now...";
  }

  const sentEmails = campaign.emails.filter((e) => e.status === "sent" && e.sentAt);
  const fallbackTargetMs = sentEmails.length
    ? Math.max(...sentEmails.map((e) => new Date(e.sentAt!).getTime())) + campaign.minInterval * 60 * 1000
    : Math.max(
        ...[campaign.startedAt, campaign.updatedAt]
          .filter((value): value is string => Boolean(value))
          .map((value) => new Date(value).getTime())
      );
  if (!Number.isFinite(fallbackTargetMs)) return null;
  return fallbackTargetMs > nowMs ? formatCountdown(fallbackTargetMs - nowMs) : "Sending now...";
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

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regeneratingSubject, setRegeneratingSubject] = useState(false);
  const [sidebarFilter, setSidebarFilter] = useState<string>("all");

  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [sendingOpen, setSendingOpen] = useState(false);

  const [editDetailsOpen, setEditDetailsOpen] = useState(false);
  const [detailsName, setDetailsName] = useState("");
  const [detailsGoal, setDetailsGoal] = useState("");
  const [detailsProduct, setDetailsProduct] = useState("");
  const [detailsCta, setDetailsCta] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);

  const [editAiOpen, setEditAiOpen] = useState(false);
  const [aiTone, setAiTone] = useState("");
  const [aiLanguage, setAiLanguage] = useState("");
  const [aiEmailLength, setAiEmailLength] = useState("");
  const [aiSystemPrompt, setAiSystemPrompt] = useState("");
  const [savingAi, setSavingAi] = useState(false);

  const [editSendingOpen, setEditSendingOpen] = useState(false);
  const [sendingIntervalType, setSendingIntervalType] = useState<"fixed" | "random">("random");
  const [sendingMinInterval, setSendingMinInterval] = useState(3);
  const [sendingMaxInterval, setSendingMaxInterval] = useState(8);
  const [savingSending, setSavingSending] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

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
    refetchInterval: (campaign?.status === "generating" || campaign?.status === "sending") ? 3000 : false,
  });

  useEffect(() => {
    if (campaign?.status !== "sending") return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [campaign?.status]);

  const emails = emailsData?.emails ?? [];
  const failedGenerationEmails = emails.filter((e) => e.status === "failed");
  const filteredEmails =
    sidebarFilter === "all"
      ? emails
      : sidebarFilter === "failed_gen"
      ? failedGenerationEmails
      : sidebarFilter === "sent"
      ? emails.filter((e) => e.status === "sent")
      : emails.filter((e) => e.approvalStatus === sidebarFilter);
  const selected = emails.find((e) => e.id === selectedId) ?? filteredEmails[0] ?? null;

  const approvedCount = emails.filter((e) => e.approvalStatus === "approved").length;
  const reviewPendingCount = emails.filter((e) => e.approvalStatus === "pending").length;
  const sendPendingCount = campaign?.pendingCount ?? 0;
  const rejectedCount = emails.filter((e) => e.approvalStatus === "rejected").length;
  const skippedCount = emails.filter((e) => e.approvalStatus === "skipped").length;
  const sentEmailsCount = emails.filter((e) => e.status === "sent").length;

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
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error("Could not pause campaign", err.error ?? "The server could not pause this campaign.");
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
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "body" }),
      }
    );
    if (res.ok) {
      toast.success("Email regenerated", "A new body has been created using AI.");
      invalidate();
    } else {
      const err = await res.json();
      toast.error("Regeneration failed", err.error ?? "Check your AI settings and try again.");
    }
    setRegenerating(false);
  };

  const handleRegenerateSubject = async () => {
    if (!selected) return;
    setRegeneratingSubject(true);
    const res = await fetch(
      `/api/campaigns/${campaignId}/emails/${selected.id}/regenerate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "subject" }),
      }
    );
    if (res.ok) {
      toast.success("Subject regenerated", "A new subject line has been created using AI.");
      invalidate();
    } else {
      const err = await res.json();
      toast.error("Regeneration failed", err.error ?? "Check your AI settings and try again.");
    }
    setRegeneratingSubject(false);
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

  const openEditSending = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!campaign) return;
    setSendingIntervalType(campaign.intervalType as "fixed" | "random");
    setSendingMinInterval(campaign.minInterval);
    setSendingMaxInterval(campaign.maxInterval);
    setEditSendingOpen(true);
  };

  const saveSending = async () => {
    setSavingSending(true);
    const res = await fetch(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intervalType: sendingIntervalType,
        minInterval: sendingMinInterval,
        maxInterval: sendingIntervalType === "random" ? sendingMaxInterval : sendingMinInterval,
      }),
    });
    if (res.ok) {
      toast.success("Sending configuration saved", "Interval settings have been updated.");
      setEditSendingOpen(false);
      invalidate();
    }
    setSavingSending(false);
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

  const canGenerate = ["pending", "failed"].includes(campaign.status);
  const canRetryGeneration = campaign.status === "pending_review" && campaign.failedCount > 0;
  const canRegenerate = ["pending_review", "ready_to_send"].includes(campaign.status) && campaign.failedCount === 0;
  const allReviewed =
    emails.length > 0 &&
    campaign.status === "pending_review" &&
    reviewPendingCount === 0 &&
    rejectedCount === 0 &&
    approvedCount > 0;
  const canApprove = campaign.status === "pending_review" && !allReviewed;
  const canSend = ["ready_to_send", "paused"].includes(campaign.status) || allReviewed;
  const canPause = campaign.status === "sending";
  const isGenerating = campaign.status === "generating";
  const hasFailures = campaign.failedCount > 0 && ["sending", "paused"].includes(campaign.status);
  const isSending = ["sending", "paused"].includes(campaign.status);

  const FILTER_TABS = [
    { key: "all", label: `All (${emails.length})` },
    { key: "sent", label: `Sent (${sentEmailsCount})` },
    { key: "pending", label: `Pending (${reviewPendingCount})` },
    { key: "approved", label: `Approved (${approvedCount})` },
    { key: "rejected", label: `Rejected (${rejectedCount})` },
    { key: "skipped", label: `Skipped (${skippedCount})` },
    { key: "failed_gen", label: `Failed (${failedGenerationEmails.length})` },
  ];

  const percent =
    campaign.totalEmails > 0
      ? Math.round(((campaign.sentCount + campaign.failedCount + campaign.skippedCount) / campaign.totalEmails) * 100)
      : 0;

  const generatedCount = campaign.emails.filter((e) => e.status === "generated").length;
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

          {/* Page header — breadcrumb + title + actions */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              <Link href="/campaigns" className="hover:text-foreground transition-colors">
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
                        {campaign.status === "completed" ? "Re-Generate Emails" : "Generate Emails"}
                      </Button>
                    )}
                    {canRetryGeneration && (
                      <Button size="sm" onClick={() => handleGenerate("retry_failed")} variant="outline">
                        <RotateCcw className="h-4 w-4" />
                        Retry Failed
                      </Button>
                    )}
                    {canRegenerate && (
                      <Button size="sm" onClick={() => handleGenerate()} variant={allReviewed ? "outline" : "outline"}>
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
              <Progress value={generationPercent} className="h-2" />
              <p className="text-xs text-muted-foreground">
                AI is personalizing each email. This page refreshes automatically every few seconds.
              </p>
            </div>
          )}

          {/* Sending progress bar */}
          {!isGenerating && campaign.totalEmails > 0 && (
            <div className="space-y-2 px-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Sending progress</span>
                <span className="text-sm text-muted-foreground">
                  {percent}%{nextEmailLabel ? ` · next email in ${nextEmailLabel}` : ""}
                </span>
              </div>
              <Progress value={percent} className="h-2" />
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
              <div className="flex items-center gap-2.5">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">Campaign Details</span>
              </div>
              <div className="flex items-center gap-2">
                {campaign.status !== "completed" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={openEditDetails}
                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </Button>
                )}
                {detailsOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
            {detailsOpen && (
              <div className="border-t px-5 py-4 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 md:grid-cols-3">
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
              <div className="flex items-center gap-2.5">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">AI Instructions</span>
              </div>
              <div className="flex items-center gap-2">
                {campaign.status !== "completed" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={openEditAi}
                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </Button>
                )}
                {aiOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
            {aiOpen && (
              <div className="border-t px-5 py-4 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 md:grid-cols-3">
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
                  <div className="col-span-1 sm:col-span-2 md:col-span-3">
                    <InfoField label="SYSTEM PROMPT">
                      <div className="max-h-36 overflow-y-auto rounded-md border bg-muted/40 p-2 text-xs leading-relaxed text-foreground/80">
                        <p className="whitespace-pre-wrap">{campaign.systemPrompt}</p>
                      </div>
                    </InfoField>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Collapsible Sending Configuration */}
          <div className="rounded-xl border bg-card">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setSendingOpen((v) => !v)}
              onKeyDown={(e) => e.key === "Enter" && setSendingOpen((v) => !v)}
              className="flex w-full cursor-pointer items-center justify-between px-5 py-4 select-none"
            >
              <div className="flex items-center gap-2.5">
                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">Sending Configuration</span>
              </div>
              <div className="flex items-center gap-2">
                {campaign.status !== "completed" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={openEditSending}
                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </Button>
                )}
                {sendingOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
            {sendingOpen && (
              <div className="border-t px-5 py-4">
                {campaign.intervalType === "fixed" ? (
                  <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
                    <InfoField label="INTERVAL TYPE">Fixed</InfoField>
                    <InfoField label="INTERVAL">{campaign.minInterval} min</InfoField>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3">
                    <InfoField label="INTERVAL TYPE">Random</InfoField>
                    <InfoField label="MIN INTERVAL">{campaign.minInterval} min</InfoField>
                    <InfoField label="MAX INTERVAL">{campaign.maxInterval} min</InfoField>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Generated Emails — split review view */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <span className="text-base font-semibold text-foreground">Generated Emails</span>
              {emails.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  {approvedCount}/{emails.length} approved
                </span>
              )}
            </div>
            <div className="flex flex-col lg:flex-row lg:h-[650px] lg:overflow-hidden">
              {/* Left sidebar — contact list */}
              <aside className={cn(
                "flex flex-col border-b lg:border-b-0 lg:border-r bg-background lg:w-80 lg:shrink-0",
                mobileView === "detail" ? "hidden lg:flex" : "flex"
              )}>
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
                <div className="flex-1 overflow-y-auto max-h-72 lg:max-h-none">
                  {emailsLoading ? (
                    <div className="space-y-2 p-4">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-14 w-full" />
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
                      const name = getContactName(email.contact);
                      const initials = getContactInitials(email.contact);
                      const avatarColor = getAvatarColor(name);

                      let approvalLabel = email.approvalStatus.toUpperCase();
                      let approvalBg = "bg-amber-100 text-amber-700";
                      if (email.status === "sent") {
                        approvalLabel = "SENT";
                        approvalBg = "bg-sky-100 text-sky-700";
                        if (email.opened) {
                          approvalLabel = "OPENED";
                          approvalBg = "bg-emerald-100 text-emerald-700";
                        }
                      } else if (email.contact.status === "suppressed") {
                        approvalLabel = "SUPPRESSED";
                        approvalBg = "bg-destructive/10 text-destructive";
                      } else if (email.approvalStatus === "approved") {
                        approvalBg = "bg-blue-100 text-blue-700";
                      } else if (email.approvalStatus === "rejected") {
                        approvalBg = "bg-destructive/10 text-destructive";
                      } else if (email.approvalStatus === "skipped") {
                        approvalBg = "bg-muted text-muted-foreground";
                      }

                      return (
                        <button
                          key={email.id}
                          onClick={() => {
                            setSelectedId(email.id);
                            setEditMode(false);
                            setMobileView("detail");
                          }}
                          className={cn(
                            "flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors",
                            isSelected ? "bg-accent" : "hover:bg-muted/40"
                          )}
                        >
                          <Avatar className={cn("h-9 w-9 shrink-0 text-white text-xs font-semibold", avatarColor)}>
                            <AvatarFallback className={cn("text-white text-xs font-semibold", avatarColor)}>
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
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
                          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", approvalBg)}>
                            {approvalLabel}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </aside>

              {/* Right panel */}
              <main className={cn(
                "flex-1 overflow-y-auto bg-muted/30",
                mobileView === "list" ? "hidden lg:block" : "block"
              )}>
                {/* Back button — below lg breakpoint only */}
                <button
                  onClick={() => setMobileView("list")}
                  className="lg:hidden flex items-center gap-1.5 px-4 pt-4 pb-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                  All contacts
                </button>
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
                    {/* Contact header card */}
                    <div className="rounded-xl border bg-card px-4 py-3 flex items-center gap-3">
                      {(() => {
                        const name = getContactName(selected.contact);
                        const initials = getContactInitials(selected.contact);
                        const avatarColor = getAvatarColor(name);
                        return (
                          <Avatar className={cn("h-10 w-10 shrink-0", avatarColor)}>
                            <AvatarFallback className={cn("text-white text-sm font-semibold", avatarColor)}>
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                        );
                      })()}
                      <Link
                        href={`/contacts?q=${encodeURIComponent(selected.contact.email)}`}
                        className="group min-w-0 flex-1"
                      >
                        <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                          {getContactName(selected.contact)}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {selected.contact.email}
                          {selected.contact.company && (
                            <> · {selected.contact.company}</>
                          )}
                        </div>
                      </Link>
                      <StatusBadge
                        status={
                          selected.contact.status === "suppressed"
                            ? "rejected"
                            : selected.approvalStatus
                        }
                      />
                    </div>

                    {/* AI notes */}
                    {selected.personalizationNotes && !editMode && (
                      <div className="rounded-lg bg-blue-50 px-4 py-3 text-xs text-blue-700 flex gap-2">
                        <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-500" />
                        <div>
                          <strong>AI notes:</strong> {selected.personalizationNotes}
                        </div>
                      </div>
                    )}

                    {/* Preview / edit */}
                    {editMode && !isSending ? (
                      <div className="rounded-xl border bg-card space-y-4 p-4">
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
                      </div>
                    ) : (
                      <div className="rounded-xl border bg-card space-y-3 p-4">
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                      </div>
                    )}

                    {selected.contact.status === "suppressed" && (
                      <div className="rounded-lg bg-destructive/10 px-4 py-2.5 text-xs text-destructive">
                        This contact is suppressed. Its email status cannot be changed.
                      </div>
                    )}

                    {/* Actions */}
                    {!editMode && selected.contact.status !== "suppressed" && !isSending && campaign.status !== "completed" && (
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={openEdit}>
                          <Edit3 className="h-4 w-4" />
                          Edit Email
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRegenerateSubject}
                          disabled={regeneratingSubject || regenerating}
                        >
                          <RefreshCw className={cn("h-4 w-4", regeneratingSubject && "animate-spin")} />
                          {regeneratingSubject ? "Regenerating..." : "Regenerate Subject"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRegenerate}
                          disabled={regenerating || regeneratingSubject}
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
          </div>

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

          {/* Edit Sending Configuration sheet */}
          <Sheet open={editSendingOpen} onOpenChange={setEditSendingOpen}>
            <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
              <SheetHeader className="border-b p-6">
                <SheetTitle>Edit Sending Configuration</SheetTitle>
                <SheetDescription>Control how quickly emails are delivered.</SheetDescription>
              </SheetHeader>
              <div className="flex-1 space-y-5 overflow-y-auto p-6">
                <div className="space-y-1.5">
                  <Label>Interval Type</Label>
                  <Select value={sendingIntervalType} onValueChange={(v) => setSendingIntervalType(v as "fixed" | "random")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed — same delay between every email</SelectItem>
                      <SelectItem value="random">Random — random delay within a range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {sendingIntervalType === "fixed" ? (
                  <div className="space-y-1.5">
                    <Label>Interval (minutes)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={sendingMinInterval}
                      onChange={(e) => setSendingMinInterval(Math.max(1, parseInt(e.target.value) || 1))}
                    />
                  </div>
                ) : (
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <Label>Sending Interval (minutes)</Label>
                      <span className="text-xs text-muted-foreground">
                        {sendingMinInterval}–{sendingMaxInterval} min
                      </span>
                    </div>
                    <div className="relative flex h-8 items-center">
                      <div className="absolute left-0 right-0 h-1.5 rounded-full bg-muted" />
                      <div
                        className="absolute h-1.5 rounded-full bg-foreground"
                        style={{
                          left: `${((sendingMinInterval - 1) / 59) * 100}%`,
                          right: `${100 - ((sendingMaxInterval - 1) / 59) * 100}%`,
                        }}
                      />
                      <div
                        className="absolute z-10 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-background bg-foreground shadow-md pointer-events-none"
                        style={{ left: `${((sendingMinInterval - 1) / 59) * 100}%` }}
                      />
                      <div
                        className="absolute z-10 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-background bg-foreground shadow-md pointer-events-none"
                        style={{ left: `${((sendingMaxInterval - 1) / 59) * 100}%` }}
                      />
                      <input
                        type="range"
                        min={1}
                        max={60}
                        value={sendingMinInterval}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setSendingMinInterval(Math.min(v, sendingMaxInterval - 1));
                        }}
                        className="absolute h-8 w-full cursor-pointer opacity-0 pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto"
                      />
                      <input
                        type="range"
                        min={1}
                        max={60}
                        value={sendingMaxInterval}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setSendingMaxInterval(Math.max(v, sendingMinInterval + 1));
                        }}
                        className="absolute h-8 w-full cursor-pointer opacity-0 pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto"
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                      <span>1 min</span>
                      <span>60 min</span>
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">Emails will be sent at a random time within this range, making the campaign appear more natural to spam filters.</p>
                  </div>
                )}
              </div>
              <div className="border-t p-6">
                <Button onClick={saveSending} disabled={savingSending} className="w-full">
                  {savingSending ? "Saving..." : "Save Configuration"}
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
                      <SelectItem value="pt">Portuguese</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                      <SelectItem value="de">German</SelectItem>
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
                      <SelectItem value="very-short">Very Short (under 50 words)</SelectItem>
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
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", iconBg)}>
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
