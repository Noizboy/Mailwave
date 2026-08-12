"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterBar } from "@/components/shared/filter-bar";
import { fetchReports, fetchEmails } from "./report-api";
import { SummaryMetrics } from "./summary-metrics";
import { CampaignTable } from "./campaign-table";
import { CampaignFilterBar } from "./campaign-filter-bar";
import { EmailFilterBar } from "./email-filter-bar";
import { EmailTable } from "./email-table";
import { EmailDetailPanel } from "./email-detail-panel";
import type { EmailRecord } from "./report-types";

export function ReportsClient() {
  const [activeView, setActiveView] = useState<"campaigns" | "emails">("campaigns");

  // Campaigns tab
  const [campaignsPage, setCampaignsPage] = useState(1);
  const [campaignsPerPage, setCampaignsPerPage] = useState(50);
  const [campaignSearch, setCampaignSearch] = useState("");

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

  const handleCampaignSearchChange = (value: string) => {
    setCampaignSearch(value);
    setCampaignsPage(1);
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const { summary, campaigns } = reportsData;
  const hasEmailFilters = filterStatus !== "" || filterQ !== "";
  const filteredCampaigns = campaigns.filter((c) =>
    c.name.toLowerCase().includes(campaignSearch.toLowerCase())
  );

  return (
    <div>
      {/* Account-wide summary */}
      <div className="p-6 pb-0">
        <SummaryMetrics summary={summary} />
      </div>

      {/* Sticky filter bar — sits below the metrics */}
      <div className="sticky top-0 z-10 border-b bg-background px-6 py-3">
        <FilterBar>
          {activeView === "campaigns" ? (
            <CampaignFilterBar
              search={campaignSearch}
              perPage={campaignsPerPage}
              onSearchChange={handleCampaignSearchChange}
              onPerPageChange={handleCampaignsPerPageChange}
            />
          ) : (
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
          )}
        </FilterBar>
      </div>

      <div className="space-y-4 p-6">

        <Card>
          {/* View switcher */}
          <CardHeader className="flex-row flex-wrap items-center gap-3 space-y-0 py-3">
            <Tabs
              value={activeView}
              onValueChange={(v) => setActiveView(v as "campaigns" | "emails")}
            >
              <TabsList>
                <TabsTrigger value="campaigns">Campaign Breakdown</TabsTrigger>
                <TabsTrigger value="emails">Email Records</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>

          {activeView === "campaigns" ? (
            <CampaignTable
              campaigns={filteredCampaigns}
              hasFilters={campaignSearch !== ""}
              page={campaignsPage}
              perPage={campaignsPerPage}
              onPageChange={setCampaignsPage}
            />
          ) : (
            <EmailTable
              data={emailsData}
              isLoading={emailsLoading}
              hasFilters={hasEmailFilters}
              page={emailPage}
              perPage={emailPerPage}
              onPageChange={setEmailPage}
              onSelectEmail={setSelectedEmail}
            />
          )}
        </Card>

        <EmailDetailPanel
          email={selectedEmail}
          onClose={() => setSelectedEmail(null)}
        />
      </div>
    </div>
  );
}
