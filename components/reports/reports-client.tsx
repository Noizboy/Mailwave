"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Download, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { DataPagination } from "@/components/shared/data-pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate, formatDateTime, cn } from "@/lib/utils";

interface ReportSummary {
  totalContacts: number;
  activeContacts: number;
  totalCampaigns: number;
  completedCampaigns: number;
  totalEmailsSent: number;
  totalFailed: number;
  deliveryRate: number;
  totalOpened: number;
  openRate: number;
}

interface CampaignReport {
  id: string;
  name: string;
  status: string;
  totalEmails: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  openedCount: number;
  startedAt: string | null;
  completedAt: string | null;
  list: { name: string };
}

interface EmailRecord {
  id: string;
  status: string;
  approvalStatus: string;
  subject: string | null;
  sentAt: string | null;
  errorReason: string | null;
  campaign: { id: string; name: string };
  contact: { id: string; email: string; firstName: string | null; lastName: string | null };
}

interface EmailStats {
  sent: number;
  failed: number;
  generated: number;
  skipped: number;
  pending: number;
}

interface EmailsResponse {
  emails: EmailRecord[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  stats: EmailStats;
}

interface ReportsData {
  summary: ReportSummary;
  campaigns: CampaignReport[];
}

async function fetchReports(): Promise<ReportsData> {
  const res = await fetch("/api/reports");
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

function buildEmailsUrl(params: {
  page: number;
  perPage: number;
  campaignId: string;
  status: string;
  q: string;
}) {
  const url = new URL("/api/reports/emails", window.location.origin);
  if (params.campaignId) url.searchParams.set("campaignId", params.campaignId);
  if (params.status) url.searchParams.set("status", params.status);
  if (params.q) url.searchParams.set("q", params.q);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("perPage", String(params.perPage));
  return url.toString();
}

export function ReportsClient() {
  const [activeView, setActiveView] = useState<"campaigns" | "emails">("campaigns");

  // Campaigns tab pagination
  const [campaignsPage, setCampaignsPage] = useState(1);
  const [campaignsPerPage, setCampaignsPerPage] = useState(50);

  // Emails tab
  const [emailPage, setEmailPage] = useState(1);
  const [emailPerPage, setEmailPerPage] = useState(25);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterQ, setFilterQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<EmailRecord | null>(null);

  const { data: reportsData, isLoading: reportsLoading } = useQuery({
    queryKey: ["reports"],
    queryFn: fetchReports,
    refetchInterval: 60_000,
  });

  const { data: emailsData, isLoading: emailsLoading } = useQuery<EmailsResponse>({
    queryKey: ["reports-emails", emailPage, emailPerPage, filterStatus, filterQ],
    queryFn: async () => {
      const res = await fetch(
        buildEmailsUrl({
          page: emailPage,
          perPage: emailPerPage,
          campaignId: "",
          status: filterStatus,
          q: filterQ,
        })
      );
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: activeView === "emails",
  });

  const handleExport = () => {
    window.open("/api/reports/export", "_blank");
  };

  const applySearch = () => {
    setFilterQ(qInput);
    setEmailPage(1);
  };

  if (reportsLoading || !reportsData) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-12 w-1/3" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const { summary, campaigns } = reportsData;
  const emailStats = emailsData?.stats;

  const metrics = [
    { label: "Emails Sent", value: summary.totalEmailsSent },
    { label: "Failed", value: summary.totalFailed },
    { label: "Opens", value: summary.totalOpened },
    { label: "Open Rate", value: `${summary.openRate}%` },
    { label: "Delivery Rate", value: `${summary.deliveryRate}%` },
    { label: "Total Campaigns", value: summary.totalCampaigns },
    { label: "Contacts", value: summary.totalContacts },
  ];

  // Campaigns tab pagination
  const campaignsTotalPages = Math.ceil(campaigns.length / campaignsPerPage);
  const paginatedCampaigns = campaigns.slice(
    (campaignsPage - 1) * campaignsPerPage,
    campaignsPage * campaignsPerPage
  );
  const campStartRow = campaigns.length > 0 ? (campaignsPage - 1) * campaignsPerPage + 1 : 0;
  const campEndRow = Math.min(campaignsPage * campaignsPerPage, campaigns.length);

  return (
    <div>
      {/* Non-sticky: page header + metrics */}
      <div className="space-y-6 p-6 pb-4">
        <PageHeader
          title="Reports"
          description="Detailed view of your sending activity."
          actions={
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          }
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {metrics.map((m) => (
            <MetricCard key={m.label} label={m.label} value={m.value} />
          ))}
        </div>
      </div>

      {/* Sticky: tabs + optional email filter */}
      <div className="sticky top-0 z-10 border-b bg-background">
        <div className="px-6 py-2">
          <Tabs value={activeView} onValueChange={(v) => setActiveView(v as "campaigns" | "emails")}>
            <TabsList>
              <TabsTrigger value="campaigns">Campaign Breakdown</TabsTrigger>
              <TabsTrigger value="emails">Email Records</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {activeView === "campaigns" && (
          <div className="border-t px-6 py-3">
            <FilterBar>
              <span className="text-sm text-muted-foreground">{campaigns.length} campaigns</span>
              <div className="flex-1" />
              <Select
                value={String(campaignsPerPage)}
                onValueChange={(v) => { setCampaignsPerPage(Number(v)); setCampaignsPage(1); }}
              >
                <SelectTrigger className="w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25 / page</SelectItem>
                  <SelectItem value="50">50 / page</SelectItem>
                  <SelectItem value="100">100 / page</SelectItem>
                </SelectContent>
              </Select>
            </FilterBar>
          </div>
        )}

        {activeView === "emails" && (
          <div className="border-t px-6 py-3">
            <FilterBar>
              {/* Search — left, grows */}
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8 pr-8"
                  placeholder="Search contact or email..."
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applySearch()}
                />
                {qInput && (
                  <button
                    type="button"
                    onClick={() => { setQInput(""); setFilterQ(""); setEmailPage(1); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Separator */}
              <div className="hidden h-6 w-px bg-border sm:block" />

              {/* Filters group */}
              <Select
                value={filterStatus || "__all__"}
                onValueChange={(v) => {
                  setFilterStatus(v === "__all__" ? "" : v);
                  setEmailPage(1);
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All statuses</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="generated">Generated</SelectItem>
                  <SelectItem value="skipped">Skipped</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>

              {(filterStatus || filterQ) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1 px-2 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setFilterStatus("");
                    setFilterQ("");
                    setQInput("");
                    setEmailPage(1);
                  }}
                >
                  <X className="h-3 w-3" />
                  Clear
                </Button>
              )}

              {/* Per page — far right */}
              <div className="ml-auto">
                <Select
                  value={String(emailPerPage)}
                  onValueChange={(v) => {
                    setEmailPerPage(Number(v));
                    setEmailPage(1);
                  }}
                >
                  <SelectTrigger className="w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25 / page</SelectItem>
                    <SelectItem value="50">50 / page</SelectItem>
                    <SelectItem value="100">100 / page</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </FilterBar>
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="space-y-4 p-6">
        {activeView === "campaigns" && (
          <>
            {emailStats && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <StatChip label="Sent" value={emailStats.sent} tone="success" />
                <StatChip label="Failed" value={emailStats.failed} tone="destructive" />
                <StatChip
                  label="Queued"
                  value={emailStats.pending + emailStats.generated}
                  tone="info"
                />
                <StatChip label="Skipped" value={emailStats.skipped} tone="neutral" />
                <StatChip
                  label="Total"
                  value={
                    emailStats.sent +
                    emailStats.failed +
                    emailStats.skipped +
                    emailStats.pending +
                    emailStats.generated
                  }
                  tone="neutral"
                />
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Campaign Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {campaigns.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    No completed or active campaigns yet.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campaign</TableHead>
                        <TableHead>List</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Sent</TableHead>
                        <TableHead className="text-right">Failed</TableHead>
                        <TableHead className="text-right">Opens · Rate</TableHead>
                        <TableHead className="text-right">Delivery</TableHead>
                        <TableHead>Completed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedCampaigns.map((c) => {
                        const rate =
                          c.sentCount + c.failedCount > 0
                            ? Math.round((c.sentCount / (c.sentCount + c.failedCount)) * 100)
                            : 0;
                        const openRate =
                          c.sentCount > 0
                            ? Math.round((c.openedCount / c.sentCount) * 100)
                            : 0;
                        return (
                          <TableRow key={c.id}>
                            <TableCell>
                              <Link
                                href={`/campaigns/${c.id}`}
                                className="font-medium text-foreground transition-colors hover:text-primary"
                              >
                                {c.name}
                              </Link>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{c.list.name}</TableCell>
                            <TableCell>
                              <StatusBadge status={c.status} />
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums">{c.totalEmails}</TableCell>
                            <TableCell className="text-right text-sm font-medium tabular-nums text-emerald-700">
                              {c.sentCount}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums text-destructive">
                              {c.failedCount > 0 ? c.failedCount : "—"}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums text-sky-700">
                              {c.openedCount > 0 ? `${c.openedCount} · ${openRate}%` : "—"}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium tabular-nums">
                              {rate}%
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {c.completedAt
                                ? formatDate(c.completedAt)
                                : c.startedAt
                                ? `Started ${formatDate(c.startedAt)}`
                                : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {campaigns.length > 0 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Showing {campStartRow}–{campEndRow} of {campaigns.length}
                </span>
                <DataPagination
                  page={campaignsPage}
                  totalPages={campaignsTotalPages}
                  onPageChange={setCampaignsPage}
                />
              </div>
            )}
          </>
        )}

        {activeView === "emails" && (
          <>
            {emailStats && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <StatChip label="Sent" value={emailStats.sent} tone="success" />
                <StatChip label="Failed" value={emailStats.failed} tone="destructive" />
                <StatChip
                  label="Queued"
                  value={emailStats.pending + emailStats.generated}
                  tone="info"
                />
                <StatChip label="Skipped" value={emailStats.skipped} tone="neutral" />
                <StatChip
                  label="Total"
                  value={
                    emailStats.sent +
                    emailStats.failed +
                    emailStats.skipped +
                    emailStats.pending +
                    emailStats.generated
                  }
                  tone="neutral"
                />
              </div>
            )}

            <Card>
              <CardContent className="p-0">
                {emailsLoading ? (
                  <div className="space-y-2 p-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : !emailsData || emailsData.emails.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    No email records found.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Sent Date</TableHead>
                        <TableHead>Error</TableHead>
                        <TableHead className="text-right">View</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {emailsData.emails.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell>
                            <Link
                              href={`/campaigns/${e.campaign.id}`}
                              className="text-sm font-medium text-foreground transition-colors hover:text-primary"
                            >
                              {e.campaign.name}
                            </Link>
                          </TableCell>
                          <TableCell className="text-sm">
                            {[e.contact.firstName, e.contact.lastName].filter(Boolean).join(" ") || "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {e.contact.email}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={e.status} />
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {e.sentAt ? formatDateTime(e.sentAt) : "—"}
                          </TableCell>
                          <TableCell className="max-w-[180px] truncate text-xs text-destructive">
                            {e.errorReason ?? "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto p-0"
                              onClick={() => setSelectedEmail(e)}
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

            {emailsData && emailsData.totalPages > 1 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Showing {(emailPage - 1) * emailPerPage + 1}–
                  {Math.min(emailPage * emailPerPage, emailsData.total)} of {emailsData.total}
                </span>
                <DataPagination
                  page={emailPage}
                  totalPages={emailsData.totalPages}
                  onPageChange={setEmailPage}
                />
              </div>
            )}
          </>
        )}
      </div>

      <Sheet open={!!selectedEmail} onOpenChange={(o) => !o && setSelectedEmail(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Email Detail</SheetTitle>
          </SheetHeader>
          {selectedEmail && (
            <div className="mt-4 space-y-4">
              <DetailBlock label="Campaign">{selectedEmail.campaign.name}</DetailBlock>
              <DetailBlock label="To">{selectedEmail.contact.email}</DetailBlock>
              <DetailBlock label="Subject">{selectedEmail.subject ?? "—"}</DetailBlock>
              <DetailBlock label="Status">
                <StatusBadge status={selectedEmail.status} />
              </DetailBlock>
              {selectedEmail.sentAt && (
                <DetailBlock label="Sent">{formatDateTime(selectedEmail.sentAt)}</DetailBlock>
              )}
              {selectedEmail.errorReason && (
                <DetailBlock label="Error">
                  <span className="whitespace-pre-wrap text-xs text-destructive">
                    {selectedEmail.errorReason}
                  </span>
                </DetailBlock>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DetailBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
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
