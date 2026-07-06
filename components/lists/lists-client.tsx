"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { List, Plus, Edit2, Trash2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { FilterBar } from "@/components/shared/filter-bar";
import { DataPagination } from "@/components/shared/data-pagination";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { cn, formatDate } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface ListItem {
  id: string;
  name: string;
  totalContacts: number;
  subscribedContacts: number;
  issueCount: number;
  createdAt: string;
  updatedAt: string;
}

async function fetchLists(): Promise<ListItem[]> {
  const res = await fetch("/api/lists");
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

export function ListsClient() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ListItem | null>(null);
  const [newName, setNewName] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ["lists"],
    queryFn: fetchLists,
  });

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const res = await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (res.ok) {
      toast.success("List created", "Your new list is ready. Add contacts to get started.");
      setShowCreate(false);
      setNewName("");
      queryClient.invalidateQueries({ queryKey: ["lists"] });
    }
  };

  const handleRename = async () => {
    if (!renameTarget || !newName.trim()) return;
    const res = await fetch(`/api/lists/${renameTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (res.ok) {
      toast.success("List renamed", "The new name has been saved.");
      setRenameTarget(null);
      setNewName("");
      queryClient.invalidateQueries({ queryKey: ["lists"] });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/lists/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("List deleted", "The list was removed. Contacts were preserved in your account.");
      queryClient.invalidateQueries({ queryKey: ["lists"] });
    }
    setDeleteTarget(null);
  };

  const filtered = lists.filter((l) =>
    l.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);
  const startRow = filtered.length > 0 ? (page - 1) * perPage + 1 : 0;
  const endRow = Math.min(page * perPage, filtered.length);

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Sticky filter bar */}
      <div className="sticky top-0 z-10 border-b bg-background px-6 py-3">
        <FilterBar>
          <Input
            placeholder="Search lists…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="min-w-[240px] flex-1"
          />
          <span className="text-sm text-muted-foreground">{filtered.length} lists</span>
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
          <Button
            onClick={() => {
              setNewName("");
              setShowCreate(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Create List
          </Button>
        </FilterBar>
      </div>

      {/* Scrollable content */}
      <div className="space-y-4 p-6">
        {filtered.length === 0 ? (
          <Card>
            <CardContent>
              <EmptyState
                icon={List}
                title={search ? "No lists match your search" : "No contact lists yet"}
                description={
                  search ? "Try a different search term." : "Create a list from your imported contacts."
                }
                action={
                  !search ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setNewName("");
                        setShowCreate(true);
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Create List
                    </Button>
                  ) : undefined
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {paginated.map((list) => (
              <Card
                key={list.id}
                className="p-5 transition-colors hover:border-primary/60"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <Link
                      href={`/lists/${list.id}`}
                      className="truncate text-sm font-semibold text-foreground hover:text-primary"
                    >
                      {list.name}
                    </Link>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      Updated {formatDate(list.updatedAt)}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="List actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/lists/${list.id}`}>View List</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setRenameTarget(list);
                          setNewName(list.name);
                        }}
                      >
                        <Edit2 className="h-4 w-4" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeleteTarget(list)}
                        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="mt-4 flex gap-6">
                  <MiniStat label="Contacts" value={list.totalContacts} />
                  <MiniStat label="Subscribed" value={list.subscribedContacts} tone="success" />
                  <MiniStat
                    label="Issues"
                    value={list.issueCount}
                    tone={list.issueCount > 0 ? "danger" : "muted"}
                  />
                </div>

                <Button asChild className="mt-4 w-full">
                  <Link href={`/campaigns/create?listId=${list.id}`}>Create Campaign</Link>
                </Button>
              </Card>
            ))}
          </div>
        )}

        {filtered.length > 0 && totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {startRow}–{endRow} of {filtered.length}
            </span>
            <DataPagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create List</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>List Name</Label>
            <Input
              placeholder="e.g. Tech Leaders Q1"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!newName.trim()}>
              Create List
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={deleteTarget ? `Delete "${deleteTarget.name}"?` : "Delete list?"}
        description="The list will be deleted, but the contacts inside it will be preserved. This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />

      {/* Rename Dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename List</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>New Name</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!newName.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "warning" | "muted" | "danger";
}) {
  return (
    <div className="text-center">
      <div
        className={cn(
          "text-lg font-semibold",
          tone === "default" && "text-foreground",
          tone === "success" && "text-emerald-600",
          tone === "warning" && "text-amber-600",
          tone === "danger" && "text-red-600",
          tone === "muted" && "text-muted-foreground"
        )}
      >
        {value}
      </div>
      <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
