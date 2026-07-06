"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Search, Trash2, Edit2, Upload, Users, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { FilterBar } from "@/components/shared/filter-bar";
import { DataPagination } from "@/components/shared/data-pagination";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ContactEditDialog } from "@/components/contacts/contact-edit-dialog";
import { BulkAssignListDialog } from "@/components/contacts/bulk-assign-list-dialog";
import { BulkChangeStatusDialog } from "@/components/contacts/bulk-change-status-dialog";
import { formatDate, cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface Contact {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  jobTitle: string | null;
  status: string;
  emailsSentCount: number;
  createdAt: string;
  listMembers: Array<{ list: { id: string; name: string } }>;
  campaignEmails: Array<{ sentAt: string | null; campaign: { name: string } }>;
}

interface ContactList {
  id: string;
  name: string;
}

async function fetchContacts(params: {
  search: string;
  status: string;
  listId: string;
  fromDate: string;
  toDate: string;
  page: number;
  limit: number;
}) {
  const q = new URLSearchParams({
    search: params.search,
    status: params.status !== "all" ? params.status : "",
    listId: params.listId !== "all" ? params.listId : "",
    fromDate: params.fromDate,
    toDate: params.toDate,
    page: String(params.page),
    limit: String(params.limit),
  });
  const res = await fetch(`/api/contacts?${q}`);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json() as Promise<{ contacts: Contact[]; total: number; page: number; limit: number; suppressAfterEmails: number }>;
}

async function fetchLists(): Promise<ContactList[]> {
  const res = await fetch("/api/lists");
  if (!res.ok) return [];
  return res.json();
}

export function ContactsClient() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [listId, setListId] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showAssignList, setShowAssignList] = useState(false);
  const [showChangeStatus, setShowChangeStatus] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [editContactId, setEditContactId] = useState<string | null>(null);

  const { data: lists = [] } = useQuery<ContactList[]>({
    queryKey: ["lists-for-filter"],
    queryFn: fetchLists,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["contacts", search, status, listId, fromDate, toDate, page, perPage],
    queryFn: () => fetchContacts({ search, status, listId, fromDate, toDate, page, limit: perPage }),
  });

  const contacts = data?.contacts ?? [];
  const total = data?.total ?? 0;
  const suppressAfterEmails = data?.suppressAfterEmails ?? 3;
  const totalPages = Math.ceil(total / perPage);
  const startRow = total > 0 ? (page - 1) * perPage + 1 : 0;
  const endRow = Math.min(page * perPage, total);
  const allSelected = contacts.length > 0 && contacts.every((c) => selectedIds.has(c.id));
  const hasFilters = search !== "" || status !== "all" || listId !== "all" || fromDate !== "" || toDate !== "";

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) contacts.forEach((c) => next.delete(c.id));
      else contacts.forEach((c) => next.add(c.id));
      return next;
    });
  };

  const handleDelete = async () => {
    if (!deleteTargetId) return;
    const res = await fetch(`/api/contacts/${deleteTargetId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Contact deleted", "The contact has been permanently removed.");
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    }
    setDeleteTargetId(null);
  };

  const handleBulkDelete = async () => {
    const count = selectedIds.size;
    await Promise.all([...selectedIds].map((id) => fetch(`/api/contacts/${id}`, { method: "DELETE" })));
    toast.success(`${count} contact${count === 1 ? "" : "s"} deleted`, "They have been permanently removed from your account.");
    setSelectedIds(new Set());
    setShowBulkDeleteConfirm(false);
    queryClient.invalidateQueries({ queryKey: ["contacts"] });
  };

  const resetPage = (fn: () => void) => { fn(); setPage(1); };

  return (
    <div>
      {/* Sticky filter bar */}
      <div className="sticky top-0 z-10 border-b bg-background px-6 py-3">
        <FilterBar>
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, email or company…"
              value={search}
              onChange={(e) => resetPage(() => setSearch(e.target.value))}
              className="pl-9"
            />
          </div>

          <Select value={listId} onValueChange={(v) => resetPage(() => setListId(v))}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All lists</SelectItem>
              {lists.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={(v) => resetPage(() => setStatus(v))}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              <SelectItem value="subscribed">Subscribed</SelectItem>
              <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
              <SelectItem value="suppressed">Suppressed</SelectItem>
              <SelectItem value="invalid">Invalid</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5">
            <span className="whitespace-nowrap text-xs text-muted-foreground">Last sent</span>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => resetPage(() => setFromDate(e.target.value))}
              className="w-[140px]"
            />
            <span className="text-xs text-muted-foreground">–</span>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => resetPage(() => setToDate(e.target.value))}
              className="w-[140px]"
            />
          </div>

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
        </FilterBar>
      </div>

      {/* Scrollable content */}
      <div className="space-y-4 p-6">
        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0 py-3">
            <div className="text-xs text-muted-foreground">{total.toLocaleString()} contacts</div>
            <div className="flex-1" />
            {selectedIds.size > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAssignList(true)}
                >
                  Assign to List ({selectedIds.size})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowChangeStatus(true)}
                >
                  Change Status ({selectedIds.size})
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setShowBulkDeleteConfirm(true)}
                >
                  Delete Selected ({selectedIds.size})
                </Button>
              </>
            )}
          </CardHeader>

          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : contacts.length === 0 ? (
              hasFilters ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  No contacts match your filters.
                </div>
              ) : (
                <EmptyState
                  icon={Users}
                  title="No contacts yet"
                  description="Upload your first CSV to start building personalized campaigns."
                  action={
                    <Button size="sm" asChild>
                      <Link href="/upload">
                        <Upload className="h-4 w-4" />
                        Upload CSV
                      </Link>
                    </Button>
                  }
                />
              )
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    </TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>List</TableHead>
                    <TableHead className="text-right">Sent / Limit</TableHead>
                    <TableHead>Last Campaign</TableHead>
                    <TableHead>Last Sent</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((contact) => {
                    const isSelected = selectedIds.has(contact.id);
                    const sentCount = contact.emailsSentCount ?? 0;
                    const atLimit = sentCount >= suppressAfterEmails;
                    const lastEmail = contact.campaignEmails?.[0];
                    const lastCampaign = lastEmail?.campaign?.name ?? "—";
                    const lastSent = lastEmail?.sentAt ? formatDate(lastEmail.sentAt) : "—";
                    const displayName =
                      [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—";

                    return (
                      <TableRow
                        key={contact.id}
                        onClick={() => setEditContactId(contact.id)}
                        className={cn(
                          "cursor-pointer",
                          isSelected && "bg-accent/40 data-[state=selected]:bg-accent"
                        )}
                        data-state={isSelected ? "selected" : undefined}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelect(contact.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={contact.status} />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{contact.email}</TableCell>
                        <TableCell className="font-medium">{displayName}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {contact.company ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {contact.listMembers.length > 0
                            ? contact.listMembers[0].list.name
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span
                            className={cn(
                              "inline-block rounded px-1.5 py-0.5 font-mono text-xs font-semibold",
                              sentCount === 0
                                ? "bg-muted text-muted-foreground"
                                : atLimit
                                  ? "bg-red-100 text-red-700"
                                  : "bg-emerald-100 text-emerald-700"
                            )}
                          >
                            {sentCount}/{suppressAfterEmails}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{lastCampaign}</TableCell>
                        <TableCell className="text-muted-foreground">{lastSent}</TableCell>
                        <TableCell
                          className="text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label="Row actions">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setEditContactId(contact.id)}>
                                <Edit2 className="h-4 w-4" />
                                Edit Contact
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setDeleteTargetId(contact.id)}
                                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>

          {total > 0 && (
            <CardFooter className="justify-between text-xs text-muted-foreground">
              <div>
                Showing {startRow}–{endRow} of {total.toLocaleString()}
              </div>
              <DataPagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </CardFooter>
          )}
        </Card>

        <ConfirmDialog
          open={showBulkDeleteConfirm}
          onOpenChange={setShowBulkDeleteConfirm}
          title={`Delete ${selectedIds.size} contact${selectedIds.size === 1 ? "" : "s"}?`}
          description="This will permanently remove the selected contacts and their associated campaign history. This action cannot be undone."
          confirmLabel="Delete"
          onConfirm={handleBulkDelete}
        />

        <ConfirmDialog
          open={deleteTargetId !== null}
          onOpenChange={(o) => !o && setDeleteTargetId(null)}
          title="Delete this contact?"
          description="This will permanently remove the contact and their associated campaign history. This action cannot be undone."
          confirmLabel="Delete"
          onConfirm={handleDelete}
        />

        <ContactEditDialog
          contactId={editContactId}
          open={editContactId !== null}
          onOpenChange={(o) => !o && setEditContactId(null)}
        />

        <BulkAssignListDialog
          open={showAssignList}
          onOpenChange={setShowAssignList}
          contactIds={[...selectedIds]}
          onSuccess={() => {
            setSelectedIds(new Set());
            queryClient.invalidateQueries({ queryKey: ["contacts"] });
          }}
        />

        <BulkChangeStatusDialog
          open={showChangeStatus}
          onOpenChange={setShowChangeStatus}
          contactIds={[...selectedIds]}
          onSuccess={() => {
            setSelectedIds(new Set());
            queryClient.invalidateQueries({ queryKey: ["contacts"] });
          }}
        />
      </div>
    </div>
  );
}
