"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataPagination } from "@/components/shared/data-pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate } from "@/lib/utils";
import type { CampaignReport } from "./report-types";

interface CampaignTableProps {
  campaigns: CampaignReport[];
  page: number;
  perPage: number;
  onPageChange: (page: number) => void;
}

export function CampaignTable({
  campaigns,
  page,
  perPage,
  onPageChange,
}: CampaignTableProps) {
  const totalPages = Math.ceil(campaigns.length / perPage);
  const paginated = campaigns.slice((page - 1) * perPage, page * perPage);
  const startRow = campaigns.length > 0 ? (page - 1) * perPage + 1 : 0;
  const endRow = Math.min(page * perPage, campaigns.length);

  return (
    <>
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
                {paginated.map((c) => {
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
                      <TableCell className="text-sm text-muted-foreground">
                        {c.list.name}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={c.status} />
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {c.totalEmails}
                      </TableCell>
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
            Showing {startRow}–{endRow} of {campaigns.length}
          </span>
          <DataPagination
            page={page}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </>
  );
}
