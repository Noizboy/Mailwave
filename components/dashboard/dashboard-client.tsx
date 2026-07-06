"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Users, List as ListIcon, Mail, Send, AlertTriangle, ClockAlert, Upload, Plus, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { MetricCard } from "@/components/shared/metric-card";
import { formatDate } from "@/lib/utils";

interface DashboardData {
  stats: {
    totalContacts: number;
    totalLists: number;
    activeCampaigns: number;
    emailsSent: number;
    failedEmails: number;
    pendingReviews: number;
  };
  smtpStatus: string;
  aiStatus: string;
  aiProvider: string | null;
  recentCampaigns: {
    id: string;
    name: string;
    status: string;
    totalEmails: number;
    sentCount: number;
    failedCount: number;
    createdAt: string;
    list: { name: string };
  }[];
}

async function fetchDashboard(): Promise<DashboardData> {
  const res = await fetch("/api/dashboard");
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

export function DashboardClient() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard,
    refetchInterval: 60000,
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[92px]" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const { stats, recentCampaigns } = data;

  const metrics = [
    { label: "Total Contacts", value: stats.totalContacts, href: "/contacts", icon: Users },
    { label: "Active Lists", value: stats.totalLists, href: "/lists", icon: ListIcon },
    { label: "Active Campaigns", value: stats.activeCampaigns, href: "/campaigns", icon: Mail },
    { label: "Emails Sent", value: stats.emailsSent, href: "/reports", icon: Send },
    {
      label: "Failed Emails",
      value: stats.failedEmails,
      href: "/reports",
      icon: AlertTriangle,
      delta: stats.failedEmails > 0 ? `${stats.failedEmails} need attention` : undefined,
      deltaTone: stats.failedEmails > 0 ? ("negative" as const) : ("neutral" as const),
    },
    { label: "Pending Reviews", value: stats.pendingReviews, href: "/campaigns", icon: ClockAlert },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {metrics.map((m) => (
          <MetricCard key={m.label} {...m} />
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Recent Campaigns</CardTitle>
          <Link
            href="/campaigns"
            className="text-xs font-medium text-primary hover:underline"
          >
            View all
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {recentCampaigns.length === 0 ? (
            <EmptyState
              icon={Mail}
              title="No campaigns yet"
              description="Create your first AI-personalized campaign."
              action={
                <Button size="sm" asChild>
                  <Link href="/campaigns/create">
                    <Plus className="h-4 w-4" />
                    Create Campaign
                  </Link>
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentCampaigns.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.sentCount}</TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">
                      {c.failedCount || "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {c.totalEmails - c.sentCount - c.failedCount}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(c.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/campaigns/${c.id}`}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        View
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/upload">
            <Upload className="h-4 w-4" />
            Upload CSV
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/campaigns/create">
            <Plus className="h-4 w-4" />
            Create Campaign
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/settings">
            <SettingsIcon className="h-4 w-4" />
            Go to Settings
          </Link>
        </Button>
      </div>
    </div>
  );
}
