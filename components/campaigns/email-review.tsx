"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  CheckCircle,
  MinusCircle,
  Edit3,
  RefreshCw,
  X,
  Clock,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
// EmailReview
// ---------------------------------------------------------------------------

export interface EmailReviewProps {
  campaign: CampaignDetail;
  campaignId: string;
  emails: EmailRow[];
  emailsLoading: boolean;
  onInvalidate: () => void;
}

export function EmailReview({
  campaign,
  campaignId,
  emails,
  emailsLoading,
  onInvalidate,
}: EmailReviewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [sidebarFilter, setSidebarFilter] = useState<string>("all");
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  // Derived
  const failedGenerationEmails = emails.filter((e) => e.status === "failed");
  const filteredEmails =
    sidebarFilter === "all"
      ? emails
      : sidebarFilter === "failed_gen"
      ? failedGenerationEmails
      : sidebarFilter === "sent"
      ? emails.filter((e) => e.status === "sent")
      : emails.filter((e) => e.approvalStatus === sidebarFilter);

  const selected =
    emails.find((e) => e.id === selectedId) ?? filteredEmails[0] ?? null;

  const approvedCount = emails.filter(
    (e) => e.approvalStatus === "approved"
  ).length;
  const reviewPendingCount = emails.filter(
    (e) => e.approvalStatus === "pending"
  ).length;
  const rejectedCount = emails.filter(
    (e) => e.approvalStatus === "rejected"
  ).length;
  const skippedCount = emails.filter(
    (e) => e.approvalStatus === "skipped"
  ).length;
  const sentEmailsCount = emails.filter((e) => e.status === "sent").length;

  const isGenerating = campaign.status === "generating";
  const isSending = ["sending", "paused"].includes(campaign.status);
  const canBulkSelect =
    !isSending && campaign.status !== "completed" && emails.length > 0;
  const allFilteredSelected =
    filteredEmails.length > 0 &&
    filteredEmails.every((e) => selectedIds.has(e.id));
  const someFilteredSelected = filteredEmails.some((e) =>
    selectedIds.has(e.id)
  );

  const FILTER_TABS = [
    { key: "all", label: `All (${emails.length})` },
    { key: "sent", label: `Sent (${sentEmailsCount})` },
    { key: "pending", label: `Pending (${reviewPendingCount})` },
    { key: "approved", label: `Approved (${approvedCount})` },
    { key: "rejected", label: `Rejected (${rejectedCount})` },
    { key: "skipped", label: `Skipped (${skippedCount})` },
    {
      key: "failed_gen",
      label: `Failed (${failedGenerationEmails.length})`,
    },
  ];

  // ---- Handlers ----

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
      onInvalidate();
      const currentIdx = filteredEmails.findIndex((e) => e.id === emailId);
      const next = filteredEmails[currentIdx + 1];
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
      onInvalidate();
    }
  };

  const handleRegenerate = async () => {
    if (!selected) return;
    await regenerateBody(selected.id);
    onInvalidate();
  };

  const handleRegenerateSubject = async () => {
    if (!selected) return;
    await regenerateSubjectAction(selected.id);
    onInvalidate();
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
      onInvalidate();
    }
  };

  // ---- Render ----

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <span className="text-base font-semibold text-foreground">
          Generated Emails
        </span>
        {emails.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {approvedCount}/{emails.length} approved
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
              onValueChange={(v) => {
                setSidebarFilter(v);
                setSelectedIds(new Set());
              }}
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
          {canBulkSelect && filteredEmails.length > 0 && (
            <div className="flex items-center gap-2.5 border-b px-4 py-2">
              <Checkbox
                checked={
                  allFilteredSelected
                    ? true
                    : someFilteredSelected
                    ? "indeterminate"
                    : false
                }
                onCheckedChange={(checked) => {
                  if (checked === true) {
                    setSelectedIds(new Set(filteredEmails.map((e) => e.id)));
                  } else {
                    setSelectedIds(new Set());
                  }
                }}
                aria-label="Select all emails"
              />
              <span className="text-xs text-muted-foreground select-none">
                Select all
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
                const isSelected =
                  (selectedId ?? filteredEmails[0]?.id) === email.id;
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
                      <div className="truncate text-sm font-medium text-foreground">
                        {name}
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
              {emails.length === 0
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
                    <strong>AI notes:</strong>{" "}
                    {selected.personalizationNotes}
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
                selected.contact.status !== "suppressed" &&
                !isSending &&
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
