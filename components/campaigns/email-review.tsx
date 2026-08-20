"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  MinusCircle,
  Edit3,
  RefreshCw,
  X,
  XCircle,
  Clock,
  Sparkles,
  Search,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";
import {
  EmailRow,
  CampaignDetail,
  getAvatarColor,
  getContactInitials,
  getContactName,
} from "./campaign-types";
import { useEmailActions } from "./use-email-actions";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PER_PAGE = 50;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function filterToQueryString(filter: string): string {
  switch (filter) {
    case "sent": return "status=sent";
    case "pending": return "status=generated&approvalStatus=pending";
    case "approved": return "status=approved";
    case "skipped": return "approvalStatus=skipped";
    case "failed_gen": return "status=failed";
    case "not_generated": return "status=not_generated";
    default: return "";
  }
}

// ponytail: mirrors variant logic in contacts-table.tsx; if max changes per-contact someday, lift this into a shared component.
function sendCountVariant(sentCount: number, max: number) {
  if (sentCount === 0) return "neutral" as const;
  if (sentCount >= max) return "destructive" as const;
  if (sentCount >= Math.ceil(max * 0.8)) return "warning" as const;
  return "success" as const;
}

function SendCountBadge({ sentCount, max }: { sentCount: number; max: number }) {
  if (max <= 0) return null;
  const atLimit = sentCount >= max;
  const label = atLimit
    ? `Contact suppressed: ${sentCount}/${max} emails sent (limit reached).`
    : `${sentCount}/${max} emails sent to this contact. Suppressed at ${max}.`;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant={sendCountVariant(sentCount, max)}
            className="shrink-0 cursor-help normal-case font-mono tracking-normal text-[10px]"
          >
            {sentCount}/{max}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

async function fetchEmailPage(
  campaignId: string,
  page: number,
  filter: string,
  search: string
): Promise<{ emails: EmailRow[]; total: number; suppressAfterEmails: number }> {
  const filterQ = filterToQueryString(filter);
  const url = `/api/campaigns/${campaignId}/emails?page=${page}&perPage=${PER_PAGE}${filterQ ? `&${filterQ}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load emails");
  const json = await res.json();
  return { emails: json.emails, total: json.total, suppressAfterEmails: json.suppressAfterEmails ?? 3 };
}

// ---------------------------------------------------------------------------
// EmailReview
// ---------------------------------------------------------------------------

export interface EmailReviewProps {
  campaign: CampaignDetail;
  campaignId: string;
}

export function EmailReview({ campaign, campaignId }: EmailReviewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [sidebarFilter, setSidebarFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const isGenerating = campaign.status === "generating";
  const isSending = ["sending", "paused"].includes(campaign.status);

  const { data: emailsData, isLoading: emailsLoading } = useQuery({
    queryKey: ["campaign-emails", campaignId, page, sidebarFilter, search],
    queryFn: () => fetchEmailPage(campaignId, page, sidebarFilter, search),
    enabled: campaign.emails.length > 0 || isGenerating || sidebarFilter === "not_generated",
    refetchInterval: isGenerating || campaign.status === "sending" ? 3000 : false,
  });

  const emails = emailsData?.emails ?? [];
  const totalFiltered = emailsData?.total ?? 0;
  const suppressAfterEmails = emailsData?.suppressAfterEmails ?? 3;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PER_PAGE));

  const {
    regenerating,
    regeneratingSubject,
    saving,
    setApproval,
    bulkSetApproval,
    regenerateBody,
    regenerateSubject: regenerateSubjectAction,
    saveEdit: saveEditAction,
  } = useEmailActions(campaignId);

  // Tab counts come from campaign-level metrics (accurate across all pages)
  // ponytail: notGeneratedCount is computed client-side from totalEmails
  // (denormalized list member count) minus emails.length (all email rows).
  // If the list shrinks between generation and read, clamp at 0.
  const notGeneratedCount = Math.max(0, campaign.totalEmails - campaign.emails.length);
  const FILTER_TABS = [
    { key: "all", label: `All (${campaign.emails.length})` },
    { key: "sent", label: `Sent (${campaign.sentCount})` },
    { key: "pending", label: `Pending (${campaign.approvalPendingCount})` },
    { key: "approved", label: `Approved (${campaign.approvedUnsentCount})` },
    { key: "skipped", label: `Skipped (${campaign.skippedCount})` },
    { key: "failed_gen", label: `Failed (${campaign.failedCount})` },
    { key: "not_generated", label: `Not Generated (${notGeneratedCount})` },
  ];

  const selected =
    emails.find((e) => e.id === selectedId) ?? emails[0] ?? null;

  const canBulkSelect =
    !isSending && campaign.status !== "completed" && emails.length > 0 && sidebarFilter !== "not_generated";
  const allPageSelected =
    emails.length > 0 && emails.every((e) => selectedIds.has(e.id));
  const somePageSelected = emails.some((e) => selectedIds.has(e.id));

  // ---- Handlers ----

  const handleFilterChange = (newFilter: string) => {
    setSidebarFilter(newFilter);
    setPage(1);
    setSelectedId(null);
    setSelectedIds(new Set());
  };

  const toggleEmailSelection = (emailId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(emailId);
      else next.delete(emailId);
      return next;
    });
  };

  const handleApproval = async (emailId: string, approvalStatus: string) => {
    const ok = await setApproval(emailId, approvalStatus);
    if (ok) {
      const currentIdx = emails.findIndex((e) => e.id === emailId);
      const next = emails[currentIdx + 1];
      if (next) setSelectedId(next.id);
    }
  };

  const handleBulkApproval = async (
    approvalStatus: "approved" | "skipped"
  ) => {
    const emailIds = [...selectedIds];
    const ok = await bulkSetApproval(emailIds, approvalStatus);
    if (ok) {
      setSelectedIds(new Set());
    }
  };

  const handleRegenerate = async () => {
    if (!selected) return;
    await regenerateBody(selected.id);
  };

  const handleRegenerateSubject = async () => {
    if (!selected) return;
    await regenerateSubjectAction(selected.id);
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
    const ok = await saveEditAction(selected.id, editSubject, editBody, andApprove);
    if (ok) {
      setEditMode(false);
    }
  };

  // ---- Render ----

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <span className="text-base font-semibold text-foreground">
          Generated Emails
        </span>
        {campaign.emails.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {campaign.approvedCount}/{campaign.emails.length} approved
          </span>
        )}
      </div>
      <div className="flex flex-col lg:flex-row lg:h-[650px] lg:overflow-hidden">
        {/* Sidebar */}
        <aside
          className={cn(
            "flex flex-col border-b lg:border-b-0 lg:border-r bg-background lg:w-80 lg:shrink-0",
            mobileView === "detail" ? "hidden lg:flex" : "flex"
          )}
        >
          <div className="overflow-x-auto border-b">
            <Tabs
              value={sidebarFilter}
              onValueChange={handleFilterChange}
              className="px-2 pt-2"
            >
              <TabsList>
                {FILTER_TABS.map((t) => (
                  <TabsTrigger key={t.key} value={t.key}>
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div className="border-b p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by name or email…"
                className="pl-9"
                aria-label="Search emails by name or email"
              />
            </div>
          </div>

          {/* Bulk action bar */}
          {canBulkSelect && selectedIds.size > 0 && (
            <div className="flex items-center gap-1.5 border-b bg-primary/5 px-4 py-2">
              <span className="flex-1 text-xs font-medium text-primary">
                {selectedIds.size} selected
              </span>
              <Button
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => handleBulkApproval("approved")}
              >
                <CheckCircle className="h-3 w-3" />
                Approve
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => handleBulkApproval("skipped")}
              >
                <MinusCircle className="h-3 w-3" />
                Skip
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground"
                onClick={() => setSelectedIds(new Set())}
                aria-label="Clear selection"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {/* Select all row */}
          {canBulkSelect && emails.length > 0 && (
            <div className="flex items-center gap-2.5 border-b px-4 py-2">
              <Checkbox
                checked={
                  allPageSelected
                    ? true
                    : somePageSelected
                    ? "indeterminate"
                    : false
                }
                onCheckedChange={(checked) => {
                  if (checked === true) {
                    setSelectedIds(new Set(emails.map((e) => e.id)));
                  } else {
                    setSelectedIds(new Set());
                  }
                }}
                aria-label="Select all on this page"
              />
              <span className="text-xs text-muted-foreground select-none">
                Select page
              </span>
            </div>
          )}

          <div className="flex-1 overflow-y-auto max-h-72 lg:max-h-none">
            {emailsLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : emails.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {isGenerating
                  ? "Emails will appear here as they are generated."
                  : campaign.status === "pending"
                  ? "Click 'Generate Emails' to create drafts."
                  : "No emails match this filter."}
              </div>
            ) : (
              emails.map((email) => {
                const isSelected =
                  (selectedId ?? emails[0]?.id) === email.id;
                const name = getContactName(email.contact);
                const initials = getContactInitials(email.contact);
                const avatarColor = getAvatarColor(name);

                let approvalLabel = email.approvalStatus.toUpperCase();
                let approvalBg = "bg-amber-100 text-amber-700";
                if (email.status === "not_generated") {
                  approvalLabel = "NOT GENERATED";
                  approvalBg = "bg-violet-100 text-violet-700";
                } else if (email.status === "failed") {
                  approvalLabel = "FAILED";
                  approvalBg = "bg-destructive/10 text-destructive";
                } else if (email.status === "sent") {
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
                  <div
                    key={email.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedId(email.id);
                      setEditMode(false);
                      setMobileView("detail");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        setSelectedId(email.id);
                        setEditMode(false);
                        setMobileView("detail");
                      }
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 border-b px-4 py-3 text-left transition-colors",
                      selectedIds.has(email.id)
                        ? "bg-primary/5"
                        : isSelected
                        ? "bg-accent"
                        : "hover:bg-muted/40"
                    )}
                    aria-label={name}
                  >
                    {canBulkSelect && (
                      <div
                        className="flex shrink-0 items-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={selectedIds.has(email.id)}
                          onCheckedChange={(checked) =>
                            toggleEmailSelection(email.id, checked === true)
                          }
                          aria-label={`Select ${getContactName(email.contact)}`}
                        />
                      </div>
                    )}
                    <Avatar
                      className={cn(
                        "h-9 w-9 shrink-0 text-white text-xs font-semibold",
                        avatarColor
                      )}
                    >
                      <AvatarFallback
                        className={cn(
                          "text-white text-xs font-semibold",
                          avatarColor
                        )}
                      >
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {name}
                        </span>
                        <SendCountBadge
                          sentCount={email.contact.emailsSentCount ?? 0}
                          max={suppressAfterEmails}
                        />
                      </div>
                      {(email.contact.firstName ||
                        email.contact.lastName) && (
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
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                        approvalBg
                      )}
                    >
                      {approvalLabel}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-2 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || emailsLoading}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                {page} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || emailsLoading}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </aside>

        {/* Detail panel */}
        <main
          className={cn(
            "flex-1 overflow-y-auto bg-muted/30",
            mobileView === "list" ? "hidden lg:block" : "block"
          )}
        >
          <button
            onClick={() => setMobileView("list")}
            className="lg:hidden flex items-center gap-1.5 px-4 pt-4 pb-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            All contacts
          </button>
          {!selected ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {campaign.emails.length === 0
                ? campaign.status === "pending"
                  ? "Generate emails to start reviewing."
                  : "No emails yet."
                : "Select a contact to preview the email."}
            </div>
          ) : (
            <div className="space-y-4 p-6">
              {/* Contact header */}
              <div className="rounded-xl border bg-card px-4 py-3 flex items-center gap-3">
                {(() => {
                  const name = getContactName(selected.contact);
                  const initials = getContactInitials(selected.contact);
                  const avatarColor = getAvatarColor(name);
                  return (
                    <Avatar
                      className={cn("h-10 w-10 shrink-0", avatarColor)}
                    >
                      <AvatarFallback
                        className={cn(
                          "text-white text-sm font-semibold",
                          avatarColor
                        )}
                      >
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  );
                })()}
                <Link
                  href={`/contacts?q=${encodeURIComponent(
                    selected.contact.email
                  )}`}
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
                    selected.status === "failed"
                      ? "rejected"
                      : selected.contact.status === "suppressed"
                      ? "rejected"
                      : selected.approvalStatus
                  }
                />
              </div>

              {/* Generation failure banner */}
              {selected.status === "failed" && (
                <div className="rounded-lg bg-destructive/10 px-4 py-3 text-xs text-destructive flex gap-2">
                  <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <div>
                    <strong>Generation failed:</strong>{" "}
                    {selected.errorReason ?? "Unknown error"}
                  </div>
                </div>
              )}

              {/* AI notes */}
              {selected.personalizationNotes && !editMode && (
                <div className="rounded-lg bg-blue-50 px-4 py-3 text-xs text-blue-700 flex gap-2">
                  <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-500" />
                  <div>
                    <strong>AI notes:</strong>{" "}
                    {selected.personalizationNotes}
                  </div>
                </div>
              )}

              {/* Preview / edit */}
              {selected.status === "not_generated" ? (
                <div className="rounded-xl border bg-card p-6 text-center">
                  <Inbox className="h-8 w-8 text-violet-500 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-foreground">
                    No email generated
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    This contact has no generated email yet. Use{" "}
                    <strong>Continue Generating</strong> or{" "}
                    <strong>Re-Generate</strong> to create it.
                  </p>
                </div>
              ) : editMode && campaign.status !== "sending" ? (
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
                    <Button
                      onClick={() => saveEdit(true)}
                      disabled={saving}
                      className="flex-1"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Save &amp; Approve
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => saveEdit(false)}
                      disabled={saving}
                    >
                      Save
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={cancelEdit}
                      disabled={saving}
                    >
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
                        <em className="font-normal text-muted-foreground">
                          No subject
                        </em>
                      )}
                    </p>
                  </div>
                  <Separator />
                  <div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {selected.body ?? (
                        <em className="text-muted-foreground">No body</em>
                      )}
                    </p>
                  </div>
                </div>
              )}

              {selected.contact.status === "suppressed" && (
                <div className="rounded-lg bg-destructive/10 px-4 py-2.5 text-xs text-destructive">
                  This contact is suppressed. Its email status cannot be
                  changed.
                </div>
              )}

              {/* Per-email actions */}
              {!editMode &&
                selected.status !== "not_generated" &&
                selected.contact.status !== "suppressed" &&
                campaign.status !== "sending" &&
                campaign.status !== "completed" && (
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
                      <RefreshCw
                        className={cn(
                          "h-4 w-4",
                          regeneratingSubject && "animate-spin"
                        )}
                      />
                      {regeneratingSubject
                        ? "Regenerating..."
                        : "Regenerate Subject"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRegenerate}
                      disabled={regenerating || regeneratingSubject}
                    >
                      <RefreshCw
                        className={cn(
                          "h-4 w-4",
                          regenerating && "animate-spin"
                        )}
                      />
                      {regenerating ? "Regenerating..." : "Regenerate Email"}
                    </Button>
                    {selected.approvalStatus !== "skipped" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleApproval(selected.id, "skipped")
                        }
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
                        onClick={() =>
                          handleApproval(selected.id, "approved")
                        }
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
  );
}
