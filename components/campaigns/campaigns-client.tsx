"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Mail, Trash2, MoreHorizontal, Pencil, FilePen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { FilterBar } from "@/components/shared/filter-bar";
import { DataPagination } from "@/components/shared/data-pagination";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface CampaignRow {
  id: string;
  name: string;
  status: string;
  totalEmails: number;
  sentCount: number;
  failedCount: number;
  pendingCount: number;
  approvalPendingCount: number;
  skippedCount: number;
  list: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

async function fetchCampaigns(): Promise<CampaignRow[]> {
  const res = await fetch("/api/campaigns");
  if (!res.ok) throw new Error("Failed to load campaigns");
  return res.json();
}

export function CampaignsClient() {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: fetchCampaigns,
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === paginated.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(paginated.map((c) => c.id)));
  };

  const handleBulkDelete = async () => {
    const count = selectedIds.size;
    await Promise.all(
      Array.from(selectedIds).map((id) =>
        fetch(`/api/campaigns/${id}`, { method: "DELETE" })
      )
    );
    toast.success(`${count} campaign${count === 1 ? "" : "s"} deleted`, "They have been permanently removed.");
    setSelectedIds(new Set());
    setShowBulkDeleteConfirm(false);
    queryClient.invalidateQueries({ queryKey: ["campaigns"] });
  };

  const handleSingleDelete = async (id: string) => {
    await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    toast.success("Campaign deleted", "The campaign has been permanently removed.");
    setDeletingId(null);
    queryClient.invalidateQueries({ queryKey: ["campaigns"] });
  };

  const handleRename = async () => {
    if (!renameId || !renameName.trim()) return;
    const res = await fetch(`/api/campaigns/${renameId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renameName.trim() }),
    });
    if (res.ok) {
      toast.success("Campaign renamed", "The campaign name has been updated.");
      setRenameId(null);
      setRenameName("");
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    } else {
      const err = await res.json();
      toast.error("Rename failed", err.error ?? "Could not rename the campaign.");
    }
  };

  const resetPage = (fn: () => void) => { fn(); setPage(1); };

  const filtered = campaigns.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch = c.name.toLowerCase().includes(q) || c.list.name.toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);
  const startRow = filtered.length > 0 ? (page - 1) * perPage + 1 : 0;
  const endRow = Math.min(page * perPage, filtered.length);

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  return (
    <div>
      {/* Sticky filter bar */}
      <div className="sticky top-0 z-10 border-b bg-background px-6 py-3">
        <FilterBar>
          <Input
            placeholder="Search campaigns…"
            value={search}
            onChange={(e) => resetPage(() => setSearch(e.target.value))}
            className="min-w-[220px] flex-1"
          />
          <Select value={statusFilter} onValueChange={(v) => resetPage(() => setStatusFilter(v))}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="generating">Generating</SelectItem>
              <SelectItem value="pending_review">Pending Review</SelectItem>
              <SelectItem value="ready_to_send">Ready to Send</SelectItem>
              <SelectItem value="sending">Sending</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={String(perPage)}
            onValueChange={(v) => { setPerPage(Number(v)); setPage(1); }}
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
          {selectedIds.size > 0 && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowBulkDeleteConfirm(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Selected ({selectedIds.size})
            </Button>
          )}
        </FilterBar>
      </div>

      {/* Scrollable content */}
      <div className="space-y-4 p-6">
        {campaigns.length === 0 ? (
          <Card>
            <CardContent>
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
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={paginated.length > 0 && paginated.every((c) => selectedIds.has(c.id))}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>List</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Sent</TableHead>
                  <TableHead className="w-16 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="py-12 text-center text-sm text-muted-foreground">
                      No campaigns match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(c.id)}
                          onCheckedChange={() => toggleSelect(c.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/campaigns/${c.id}`}
                          className="font-medium text-foreground transition-colors hover:text-primary"
                        >
                          {c.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/lists/${c.list.id}`}
                          className="text-sm text-muted-foreground transition-colors hover:text-primary"
                        >
                          {c.list.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={c.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{c.totalEmails}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-emerald-700">
                        {c.sentCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-destructive">
                        {c.failedCount > 0 ? c.failedCount : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {c.approvalPendingCount > 0 ? c.approvalPendingCount : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(c.createdAt)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.completedAt ? formatDate(c.completedAt) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/campaigns/${c.id}`}>
                                <Pencil className="mr-2 h-3.5 w-3.5" />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setRenameId(c.id);
                                setRenameName(c.name);
                              }}
                            >
                              <FilePen className="mr-2 h-3.5 w-3.5" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeletingId(c.id)}
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        )}

        {filtered.length > 0 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {startRow}–{endRow} of {filtered.length}
            </span>
            <DataPagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* Bulk delete confirm */}
      <ConfirmDialog
        open={showBulkDeleteConfirm}
        onOpenChange={setShowBulkDeleteConfirm}
        title={`Delete ${selectedIds.size} campaign${selectedIds.size === 1 ? "" : "s"}?`}
        description="This will permanently remove the selected campaigns along with their generated emails and send history. This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleBulkDelete}
      />

      {/* Single delete confirm */}
      <ConfirmDialog
        open={!!deletingId}
        onOpenChange={(open) => { if (!open) setDeletingId(null); }}
        title="Delete campaign?"
        description="This will permanently remove this campaign along with its generated emails and send history. This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => { if (deletingId) handleSingleDelete(deletingId); }}
      />

      {/* Rename dialog */}
      <ConfirmDialog
        open={!!renameId}
        onOpenChange={(open) => { if (!open) { setRenameId(null); setRenameName(""); } }}
        title="Rename campaign"
        description={
          <Input
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleRename(); }}
            placeholder="Campaign name"
            className="mt-2"
            autoFocus
          />
        }
        confirmLabel="Rename"
        onConfirm={handleRename}
      />
    </div>
  );
}
