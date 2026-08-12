"use client";

import Link from "next/link";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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
  hasFilters: boolean;
  page: number;
  perPage: number;
  onPageChange: (page: number) => void;
  onSelectEmail: (email: EmailRecord) => void;
}

export function EmailTable({
  data,
  isLoading,
  hasFilters,
  page,
  perPage,
  onPageChange,
  onSelectEmail,
}: EmailTableProps) {
  return (
    <>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !data || data.emails.length === 0 ? (
          hasFilters ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No email records match your filters.
            </div>
          ) : (
            <EmptyState
              icon={Mail}
              title="No email records yet"
              description="Generated and sent emails appear here once a campaign runs."
            />
          )
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

      {data && data.total > 0 && (
        <CardFooter className="justify-between text-xs text-muted-foreground">
          <div>
            Showing {(page - 1) * perPage + 1}–
            {Math.min(page * perPage, data.total)} of {data.total}
          </div>
          <DataPagination
            page={page}
            totalPages={data.totalPages}
            onPageChange={onPageChange}
          />
        </CardFooter>
      )}
    </>
  );
}
