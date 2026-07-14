"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { DataPagination } from "@/components/shared/data-pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/utils";
import type { EmailRecord, EmailsResponse } from "./report-types";

interface EmailTableProps {
  data: EmailsResponse | undefined;
  isLoading: boolean;
  page: number;
  perPage: number;
  onPageChange: (page: number) => void;
  onSelectEmail: (email: EmailRecord) => void;
}

export function EmailTable({
  data,
  isLoading,
  page,
  perPage,
  onPageChange,
  onSelectEmail,
}: EmailTableProps) {
  return (
    <>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !data || data.emails.length === 0 ? (
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
                {data.emails.map((e) => (
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
                      {[e.contact.firstName, e.contact.lastName]
                        .filter(Boolean)
                        .join(" ") || "—"}
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
                        onClick={() => onSelectEmail(e)}
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

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {(page - 1) * perPage + 1}–
            {Math.min(page * perPage, data.total)} of {data.total}
          </span>
          <DataPagination
            page={page}
            totalPages={data.totalPages}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </>
  );
}
