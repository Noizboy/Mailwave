"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/utils";
import type { EmailRecord } from "./report-types";

interface EmailDetailPanelProps {
  email: EmailRecord | null;
  onClose: () => void;
}

export function EmailDetailPanel({ email, onClose }: EmailDetailPanelProps) {
  return (
    <Sheet open={!!email} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Email Detail</SheetTitle>
        </SheetHeader>
        {email && (
          <div className="mt-4 space-y-4">
            <DetailBlock label="Campaign">{email.campaign.name}</DetailBlock>
            <DetailBlock label="To">{email.contact.email}</DetailBlock>
            <DetailBlock label="Subject">{email.subject ?? "—"}</DetailBlock>
            <DetailBlock label="Status">
              <StatusBadge status={email.status} />
            </DetailBlock>
            {email.sentAt && (
              <DetailBlock label="Sent">{formatDateTime(email.sentAt)}</DetailBlock>
            )}
            {email.errorReason && (
              <DetailBlock label="Error">
                <span className="whitespace-pre-wrap text-xs text-destructive">
                  {email.errorReason}
                </span>
              </DetailBlock>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}
