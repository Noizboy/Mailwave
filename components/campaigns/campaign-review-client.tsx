"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  CheckCircle,
  XCircle,
  MinusCircle,
  RefreshCw,
  Edit3,
  CheckCheck,
  Play,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
}

const DOT_COLOR: Record<string, string> = {
  approved: "bg-emerald-500",
  pending: "bg-amber-400",
  rejected: "bg-destructive",
  skipped: "bg-muted-foreground",
};

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

export function CampaignReviewClient({ campaignId }: { campaignId: string }) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [sidebarFilter, setSidebarFilter] = useState<string>("all");

  const { data: campaign } = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: () => fetchCampaign(campaignId),
  });

  const { data: emailsData, isLoading } = useQuery({
    queryKey: ["campaign-emails-review", campaignId],
    queryFn: () => fetchEmails(campaignId),
    enabled: !!campaign,
  });

  const emails = emailsData?.emails ?? [];
  const filteredEmails =
    sidebarFilter === "all" ? emails : emails.filter((e) => e.approvalStatus === sidebarFilter);
  const selected = emails.find((e) => e.id === selectedId) ?? filteredEmails[0] ?? null;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["campaign-emails-review", campaignId] });
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
      toast.success(andApprove ? "Saved and approved" : "Changes saved", andApprove ? "Email updated and marked as approved." : "Your edits have been saved to this email.");
      setEditMode(false);
      invalidate();
    } else {
      toast.error("Could not save changes", "Your edits were not saved. Try again.");
    }
    setSaving(false);
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
      toast.success("Sending started", "Emails are being delivered. Monitor progress in the campaign detail.");
      invalidate();
    } else {
      const err = await res.json();
      toast.error("Could not start sending", err.error ?? "Check your SMTP settings and try again.");
    }
  };

  const approvedCount = emails.filter((e) => e.approvalStatus === "approved").length;
  const pendingCount = emails.filter((e) => e.approvalStatus === "pending").length;
  const rejectedCount = emails.filter((e) => e.approvalStatus === "rejected").length;
  const skippedCount = emails.filter((e) => e.approvalStatus === "skipped").length;

  const FILTER_TABS = [
    { key: "all", label: `All (${emails.length})` },
    { key: "pending", label: `Pending (${pendingCount})` },
    { key: "approved", label: `Approved (${approvedCount})` },
    { key: "rejected", label: `Rejected (${rejectedCount})` },
    { key: "skipped", label: `Skipped (${skippedCount})` },
  ];

  if (isLoading || !campaign) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Skeleton className="h-64 w-full max-w-3xl" />
      </div>
    );
  }

  const canSend = ["ready_to_send", "paused"].includes(campaign.status);

  return (
    <div className="flex h-full flex-col">
      {/* Review header bar */}
      <div className="flex shrink-0 items-center justify-between border-b bg-background px-6 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-foreground">{campaign.name}</h2>
          <StatusBadge status="pending_review" />
          <span className="text-sm text-muted-foreground">
            {approvedCount}/{emails.length} approved
          </span>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleApproveAll}>
              <CheckCheck className="h-4 w-4" />
              Approve All
            </Button>
          )}
          {canSend && (
            <Button size="sm" onClick={handleSend}>
              <Play className="h-4 w-4" />
              Send Campaign
            </Button>
          )}
          <Link
            href={`/campaigns/${campaignId}`}
            className="ml-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Back to campaign
          </Link>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
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
            {filteredEmails.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No emails in this filter.
              </div>
            ) : (
              filteredEmails.map((email) => {
                const isSelected = (selectedId ?? filteredEmails[0]?.id) === email.id;
                const name =
                  [email.contact.firstName, email.contact.lastName].filter(Boolean).join(" ") ||
                  email.contact.email;

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
              Select a contact to preview the email.
            </div>
          ) : (
            <div className="mx-auto max-w-2xl space-y-4 p-6">
              {/* Contact info */}
              <Card className="flex items-start justify-between p-4">
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {[selected.contact.firstName, selected.contact.lastName].filter(Boolean).join(" ") ||
                      selected.contact.email}
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
                </div>
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
                    <Button variant="ghost" onClick={cancelEdit} disabled={saving}>
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
    </div>
  );
}
