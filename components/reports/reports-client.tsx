"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { fetchReports, fetchEmails } from "./report-api";
import { SummaryMetrics, EmailStatsChips } from "./summary-metrics";
import { CampaignTable } from "./campaign-table";
import { CampaignFilterBar } from "./campaign-filter-bar";
import { EmailFilterBar } from "./email-filter-bar";
import { EmailTable } from "./email-table";
import { EmailDetailPanel } from "./email-detail-panel";
import type { EmailRecord } from "./report-types";

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

  const { data: emailsData, isLoading: emailsLoading } = useQuery({
    queryKey: ["reports-emails", emailPage, emailPerPage, filterStatus, filterQ],
    queryFn: () =>
      fetchEmails({
        page: emailPage,
        perPage: emailPerPage,
        status: filterStatus,
        q: filterQ,
      }),
    enabled: activeView === "emails",
  });

  const handleExport = () => {
    window.open("/api/reports/export", "_blank");
  };

  const applySearch = () => {
    setFilterQ(qInput);
    setEmailPage(1);
  };

  const handleClearSearch = () => {
    setQInput("");
    setFilterQ("");
    setEmailPage(1);
  };

  const handleStatusChange = (status: string) => {
    setFilterStatus(status);
    setEmailPage(1);
  };

  const handleClearAllFilters = () => {
    setFilterStatus("");
    setFilterQ("");
    setQInput("");
    setEmailPage(1);
  };

  const handleCampaignsPerPageChange = (perPage: number) => {
    setCampaignsPerPage(perPage);
    setCampaignsPage(1);
  };

  const handleEmailsPerPageChange = (perPage: number) => {
    setEmailPerPage(perPage);
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
        <SummaryMetrics summary={summary} />
      </div>

      {/* Sticky: tabs + filter bars */}
      <div className="sticky top-0 z-10 border-b bg-background">
        <div className="px-6 py-2">
          <Tabs
            value={activeView}
            onValueChange={(v) => setActiveView(v as "campaigns" | "emails")}
          >
            <TabsList>
              <TabsTrigger value="campaigns">Campaign Breakdown</TabsTrigger>
              <TabsTrigger value="emails">Email Records</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {activeView === "campaigns" && (
          <div className="border-t px-6 py-3">
            <CampaignFilterBar
              campaignCount={campaigns.length}
              perPage={campaignsPerPage}
              onPerPageChange={handleCampaignsPerPageChange}
            />
          </div>
        )}

        {activeView === "emails" && (
          <div className="border-t px-6 py-3">
            <EmailFilterBar
              qInput={qInput}
              filterStatus={filterStatus}
              filterQ={filterQ}
              perPage={emailPerPage}
              onQInputChange={setQInput}
              onSearch={applySearch}
              onClearSearch={handleClearSearch}
              onStatusChange={handleStatusChange}
              onClearAll={handleClearAllFilters}
              onPerPageChange={handleEmailsPerPageChange}
            />
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="space-y-4 p-6">
        {activeView === "campaigns" && (
          <>
            {emailStats && <EmailStatsChips stats={emailStats} />}
            <CampaignTable
              campaigns={campaigns}
              page={campaignsPage}
              perPage={campaignsPerPage}
              onPageChange={setCampaignsPage}
            />
          </>
        )}

        {activeView === "emails" && (
          <>
            {emailStats && <EmailStatsChips stats={emailStats} />}
            <EmailTable
              data={emailsData}
              isLoading={emailsLoading}
              page={emailPage}
              perPage={emailPerPage}
              onPageChange={setEmailPage}
              onSelectEmail={setSelectedEmail}
            />
          </>
        )}
      </div>

      <EmailDetailPanel
        email={selectedEmail}
        onClose={() => setSelectedEmail(null)}
      />
    </div>
  );
}
