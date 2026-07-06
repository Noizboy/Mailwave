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
  Eye,
  RotateCcw,
  XCircle,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  extraInstructions: string | null;
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

async function fetchCampaign(id: string): Promise<CampaignDetail> {
  const res = await fetch(`/api/campaigns/${id}`);
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

async function fetchEmails(
  campaignId: string,
  approvalFilter: string
): Promise<{ emails: EmailRow[]; total: number }> {
  const params = approvalFilter !== "all" ? `?approvalStatus=${approvalFilter}` : "";
  const res = await fetch(`/api/campaigns/${campaignId}/emails${params}`);
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

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

export function CampaignDetailClient({ campaignId }: { campaignId: string }) {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [approvalFilter, setApprovalFilter] = useState("all");
  const [editEmail, setEditEmail] = useState<EmailRow | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);

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
    queryKey: ["campaign-emails", campaignId, approvalFilter],
    queryFn: () => fetchEmails(campaignId, approvalFilter),
    enabled: !!campaign,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["campaign-emails", campaignId] });
  };

  const handleApprovalChange = async (emailId: string, approvalStatus: string) => {
    const res = await fetch(`/api/campaigns/${campaignId}/emails/${emailId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalStatus }),
    });
    if (res.ok) {
      toast.success("Email status updated", `Marked as ${approvalStatus}.`);
      invalidate();
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

  const handleGenerate = async () => {
    const res = await fetch(`/api/campaigns/${campaignId}/generate`, { method: "POST" });
    if (res.ok) {
      toast.success("Generating emails", "AI is personalizing each email. This may take a few minutes.");
      invalidate();
    } else {
      const err = await res.json();
      toast.error("Generation failed", err.error ?? "Check your AI settings and try again.");
    }
  };

  const openEdit = (email: EmailRow) => {
    setEditEmail(email);
    setEditSubject(email.subject ?? "");
    setEditBody(email.body ?? "");
  };

  const saveEdit = async () => {
    if (!editEmail) return;
    setSaving(true);
    const res = await fetch(`/api/campaigns/${campaignId}/emails/${editEmail.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: editSubject, body: editBody }),
    });
    if (res.ok) {
      toast.success("Email saved", "Subject and body have been updated.");
      setEditEmail(null);
      invalidate();
    }
    setSaving(false);
  };

  const openEditDetails = () => {
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

  const openEditAi = () => {
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

  if (campaign.status === "draft" && searchParams.get("wizard") === "1") {
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

  const emails = emailsData?.emails ?? [];
  const canGenerate = ["draft", "pending", "failed"].includes(campaign.status);
  const canApprove = campaign.status === "pending_review";
  const isPendingReview = campaign.status === "pending_review";
  const canSend = ["ready_to_send", "paused"].includes(campaign.status);
  const canPause = campaign.status === "sending";
  const isGenerating = campaign.status === "generating";
  const hasFailures = campaign.failedCount > 0 && ["sending", "paused", "completed"].includes(campaign.status);

  const FILTER_TABS = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
    { key: "skipped", label: "Skipped" },
  ];

  const percent =
    campaign.totalEmails > 0
      ? Math.round((campaign.sentCount / campaign.totalEmails) * 100)
      : 0;

  const nextEmailLabel = getNextEmailLabel(campaign);

  const stats: Array<{ label: string; value: number; tone: "neutral" | "success" | "destructive" | "warning" }> = [
    { label: "Total Emails", value: campaign.totalEmails, tone: "neutral" },
    { label: "Sent", value: campaign.sentCount, tone: "success" },
    { label: "Failed", value: campaign.failedCount, tone: "destructive" },
    { label: "Pending", value: campaign.pendingCount, tone: "warning" },
    { label: "Skipped", value: campaign.skippedCount, tone: "neutral" },
  ];

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title={campaign.name}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={campaign.status} />
            {canGenerate && (
              <Button size="sm" onClick={handleGenerate}>
                <Play className="h-4 w-4" />
                Generate Emails
              </Button>
            )}
            {isPendingReview && (
              <Button size="sm" asChild>
                <Link href={`/campaigns/${campaignId}/review`}>
                  <Eye className="h-4 w-4" />
                  Review Emails
                </Link>
              </Button>
            )}
            {canApprove && (
              <Button size="sm" onClick={handleApproveAll} variant="outline">
                <CheckCheck className="h-4 w-4" />
                Approve All
              </Button>
            )}
            {isGenerating && (
              <Button size="sm" disabled variant="outline">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Generating...
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
          </div>
        }
      />
      <main className="flex-1 overflow-y-auto p-6">
      <div className="space-y-6">

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map((s) => (
          <StatChip key={s.label} label={s.label} value={s.value} tone={s.tone} />
        ))}
      </div>

      {/* Progress bar */}
      {campaign.totalEmails > 0 && (
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

      {/* Detail cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Campaign Details</CardTitle>
            <Button variant="outline" size="sm" onClick={openEditDetails}>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle>AI Instructions</CardTitle>
            <Button variant="outline" size="sm" onClick={openEditAi}>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>
      </div>

      {/* Email review */}
      <Card>
        <CardHeader className="gap-3">
          <CardTitle>Generated Emails</CardTitle>
          <Tabs value={approvalFilter} onValueChange={setApprovalFilter}>
            <TabsList>
              {FILTER_TABS.map((t) => (
                <TabsTrigger key={t.key} value={t.key}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="p-0">
          {emailsLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : emails.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {["draft", "pending"].includes(campaign.status)
                ? "Click 'Generate Emails' to create personalized drafts for each contact."
                : "No emails match this filter."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent At</TableHead>
                  <TableHead className="w-16">View</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emails.map((email) => (
                  <TableRow key={email.id}>
                    <TableCell>
                      <div className="text-sm font-medium">
                        {email.contact.firstName || email.contact.lastName
                          ? `${email.contact.firstName ?? ""} ${email.contact.lastName ?? ""}`.trim()
                          : email.contact.email}
                      </div>
                      {(email.contact.firstName || email.contact.lastName) && (
                        <div className="text-xs text-muted-foreground">
                          {email.contact.email}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <span className="line-clamp-1 text-sm text-foreground">
                        {email.subject ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={email.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {email.sentAt ? new Date(email.sentAt).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => openEdit(email)}
                        className="h-auto p-0"
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit email sheet */}
      <Sheet open={!!editEmail} onOpenChange={(o) => !o && setEditEmail(null)}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
          <SheetHeader className="border-b p-6">
            <SheetTitle>Edit Email</SheetTitle>
            <SheetDescription>{editEmail?.contact.email}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto p-6">
            {editEmail?.personalizationNotes && (
              <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
                <strong>AI Notes:</strong> {editEmail.personalizationNotes}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Body</Label>
              <Textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={16}
                className="font-mono text-xs"
              />
            </div>
          </div>
          <div className="flex gap-2 border-t p-6">
            <Button onClick={saveEdit} disabled={saving} className="flex-1">
              {saving ? "Saving..." : "Save Changes"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                saveEdit().then(() => handleApprovalChange(editEmail!.id, "approved"));
              }}
              disabled={saving}
            >
              Save &amp; Approve
            </Button>
          </div>
        </SheetContent>
      </Sheet>

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
            <div className="space-y-1.5">
              <Label>System Prompt</Label>
              <Textarea
                value={aiSystemPrompt}
                onChange={(e) => setAiSystemPrompt(e.target.value)}
                placeholder="Custom system prompt for email generation..."
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
