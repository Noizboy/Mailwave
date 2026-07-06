"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Users, Mail, Trash2, Plus, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { ContactEditDialog } from "@/components/contacts/contact-edit-dialog";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface Member {
  contactId: string;
  addedAt: string;
  contact: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    status: string;
    emailsSentCount: number;
  };
}

interface ListDetail {
  id: string;
  name: string;
  members: Member[];
  stats: {
    total: number;
    subscribed: number;
    unsubscribed: number;
    invalid: number;
    suppressed: number;
  };
  createdAt: string;
  updatedAt: string;
}

async function fetchListDetail(id: string): Promise<ListDetail> {
  const res = await fetch(`/api/lists/${id}`);
  if (!res.ok) throw new Error("Failed to load list");
  return res.json();
}

async function fetchSuppressAfter(): Promise<number> {
  const res = await fetch("/api/settings/sending-limits");
  if (!res.ok) return 0;
  const data = await res.json();
  return data.suppressAfterEmails ?? 0;
}

export function ListDetailClient({ listId }: { listId: string }) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [editContactId, setEditContactId] = useState<string | null>(null);

  const { data: list, isLoading, error } = useQuery({
    queryKey: ["list", listId],
    queryFn: () => fetchListDetail(listId),
  });

  const { data: suppressAfter = 0 } = useQuery({
    queryKey: ["settings-limits"],
    queryFn: fetchSuppressAfter,
  });

  const toggleSelect = (contactId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  };

  const toggleAll = () => {
    if (!list) return;
    if (selectedIds.size === list.members.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(list.members.map((m) => m.contactId)));
  };

  const handleBulkRemove = async () => {
    const res = await fetch(`/api/lists/${listId}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactIds: Array.from(selectedIds) }),
    });
    if (res.ok) {
      toast.success(`${selectedIds.size} contact${selectedIds.size === 1 ? "" : "s"} removed`, "They have been removed from this list but remain in your contacts.");
      setSelectedIds(new Set());
      setShowRemoveConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["list", listId] });
      queryClient.invalidateQueries({ queryKey: ["lists"] });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-1/2" />
        <div className="flex gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 flex-1" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !list) {
    return (
      <div className="p-12 text-center text-muted-foreground">
        Failed to load list.
      </div>
    );
  }

  const { stats } = list;

  const chips: Array<{
    label: string;
    value: number;
    tone: "neutral" | "success" | "warning" | "destructive";
  }> = [
    { label: "Total", value: stats.total, tone: "neutral" },
    { label: "Subscribed", value: stats.subscribed, tone: "success" },
    { label: "Unsubscribed", value: stats.unsubscribed, tone: "destructive" },
    { label: "Suppressed", value: stats.suppressed, tone: "neutral" },
    { label: "Invalid", value: stats.invalid, tone: "destructive" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={list.name}
        description={`${stats.total} contacts`}
        actions={
          <Button asChild>
            <Link href={`/campaigns/create?listId=${listId}`}>
              <Mail className="h-4 w-4" />
              Create Campaign
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {chips.map((c) => (
          <StatChip key={c.label} {...c} />
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle>Contacts</CardTitle>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowRemoveConfirm(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove ({selectedIds.size})
              </Button>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link href="/contacts">
                <Plus className="h-3.5 w-3.5" />
                Add from Contacts
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {list.members.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Users}
                title="No contacts in this list"
                description="Import contacts or add them from the contacts page."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        selectedIds.size === list.members.length && list.members.length > 0
                      }
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead className="text-right">Emails Sent</TableHead>
                  <TableHead className="w-16">Edit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.members.map(({ contact, contactId }) => (
                  <TableRow key={contactId}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(contactId)}
                        onCheckedChange={() => toggleSelect(contactId)}
                      />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={contact.status} />
                    </TableCell>
                    <TableCell className="text-sm">{contact.email}</TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => setEditContactId(contact.id)}
                        className="text-sm font-medium text-foreground transition-colors hover:text-primary"
                      >
                        {contact.firstName || contact.lastName
                          ? `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim()
                          : "—"}
                      </button>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {contact.company ?? "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      <span className={contact.emailsSentCount >= suppressAfter && suppressAfter > 0 ? "text-destructive font-medium" : "text-muted-foreground"}>
                        {contact.emailsSentCount}
                        {suppressAfter > 0 && ` / ${suppressAfter}`}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => setEditContactId(contact.id)}>
                        <Edit2 className="h-4 w-4" />
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ContactEditDialog
        contactId={editContactId}
        open={editContactId !== null}
        onOpenChange={(o) => !o && setEditContactId(null)}
      />

      <Dialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {selectedIds.size} contact(s) from list?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The contacts themselves are not deleted — only their membership in this list is
            removed.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRemoveConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBulkRemove}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  tone: "neutral" | "success" | "warning" | "destructive";
}) {
  return (
    <div
      className={cn(
        "rounded-lg p-4",
        tone === "neutral" && "bg-muted",
        tone === "success" && "bg-emerald-50",
        tone === "warning" && "bg-amber-50",
        tone === "destructive" && "bg-destructive/5"
      )}
    >
      <div
        className={cn(
          "text-[10.5px] font-semibold uppercase tracking-wider",
          tone === "neutral" && "text-muted-foreground",
          tone === "success" && "text-emerald-700",
          tone === "warning" && "text-amber-700",
          tone === "destructive" && "text-destructive"
        )}
      >
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}
