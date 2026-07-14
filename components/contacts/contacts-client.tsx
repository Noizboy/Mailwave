"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { DataPagination } from "@/components/shared/data-pagination";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ContactEditDialog } from "./contact-edit-dialog";
import { BulkAssignListDialog } from "./bulk-assign-list-dialog";
import { BulkChangeStatusDialog } from "./bulk-change-status-dialog";
import { ContactsFilterBar } from "./contacts-filter-bar";
import { ContactsTable } from "./contacts-table";
import type { ContactFilters, ContactList, ContactsResponse } from "./contact-types";
import { useContactActions } from "./use-contact-actions";

async function fetchContacts(filters: ContactFilters): Promise<ContactsResponse> { const query = new URLSearchParams({ search: filters.search, status: filters.status !== "all" ? filters.status : "", listId: filters.listId !== "all" ? filters.listId : "", fromDate: filters.fromDate, toDate: filters.toDate, page: String(filters.page), limit: String(filters.limit) }); const response = await fetch(`/api/contacts?${query}`); if (!response.ok) throw new Error("Failed to fetch"); return response.json(); }
async function fetchLists(): Promise<ContactList[]> { const response = await fetch("/api/lists"); return response.ok ? response.json() : []; }

export function ContactsClient() {
  const [search, setSearch] = useState(""); const [status, setStatus] = useState("all"); const [listId, setListId] = useState("all"); const [fromDate, setFromDate] = useState(""); const [toDate, setToDate] = useState(""); const [page, setPage] = useState(1); const [perPage, setPerPage] = useState(50); const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { data: lists = [] } = useQuery({ queryKey: ["lists-for-filter"], queryFn: fetchLists });
  const { data, isLoading } = useQuery({ queryKey: ["contacts", search, status, listId, fromDate, toDate, page, perPage], queryFn: () => fetchContacts({ search, status, listId, fromDate, toDate, page, limit: perPage }) });
  const contacts = data?.contacts ?? []; const total = data?.total ?? 0; const suppressAfterEmails = data?.suppressAfterEmails ?? 3; const totalPages = Math.ceil(total / perPage); const startRow = total > 0 ? (page - 1) * perPage + 1 : 0; const endRow = Math.min(page * perPage, total); const allSelected = contacts.length > 0 && contacts.every((contact) => selectedIds.has(contact.id)); const hasFilters = search !== "" || status !== "all" || listId !== "all" || fromDate !== "" || toDate !== "";
  const resetPage = (update: () => void) => { update(); setPage(1); }; const toggleSelect = (id: string) => setSelectedIds((previous) => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; }); const toggleAll = () => setSelectedIds((previous) => { const next = new Set(previous); contacts.forEach((contact) => allSelected ? next.delete(contact.id) : next.add(contact.id)); return next; });
  const actions = useContactActions(selectedIds, () => setSelectedIds(new Set()));
  return <div><ContactsFilterBar search={search} status={status} listId={listId} fromDate={fromDate} toDate={toDate} perPage={perPage} lists={lists} onSearchChange={(value) => resetPage(() => setSearch(value))} onStatusChange={(value) => resetPage(() => setStatus(value))} onListChange={(value) => resetPage(() => setListId(value))} onFromDateChange={(value) => resetPage(() => setFromDate(value))} onToDateChange={(value) => resetPage(() => setToDate(value))} onPerPageChange={(value) => { setPerPage(value); setPage(1); }} />
    <div className="space-y-4 p-6"><Card><CardHeader className="flex-row items-center gap-2 space-y-0 py-3"><div className="text-xs text-muted-foreground">{total.toLocaleString()} contacts</div><div className="flex-1" />{selectedIds.size > 0 && <><Button variant="outline" size="sm" onClick={() => actions.setShowAssignList(true)}>Assign to List ({selectedIds.size})</Button><Button variant="outline" size="sm" onClick={() => actions.setShowChangeStatus(true)}>Change Status ({selectedIds.size})</Button><Button variant="danger" size="sm" onClick={() => actions.setShowBulkDeleteConfirm(true)}>Delete Selected ({selectedIds.size})</Button></>}</CardHeader><ContactsTable contacts={contacts} isLoading={isLoading} hasFilters={hasFilters} selectedIds={selectedIds} suppressAfterEmails={suppressAfterEmails} allSelected={allSelected} onToggleAll={toggleAll} onToggleSelect={toggleSelect} onEdit={actions.setEditContactId} onDelete={actions.setDeleteTargetId} />{total > 0 && <CardFooter className="justify-between text-xs text-muted-foreground"><div>Showing {startRow}–{endRow} of {total.toLocaleString()}</div><DataPagination page={page} totalPages={totalPages} onPageChange={setPage} /></CardFooter>}</Card>
      <ConfirmDialog open={actions.showBulkDeleteConfirm} onOpenChange={actions.setShowBulkDeleteConfirm} title={`Delete ${selectedIds.size} contact${selectedIds.size === 1 ? "" : "s"}?`} description="This will permanently remove the selected contacts and their associated campaign history. This action cannot be undone." confirmLabel="Delete" onConfirm={actions.deleteSelected} /><ConfirmDialog open={actions.deleteTargetId !== null} onOpenChange={(open) => !open && actions.setDeleteTargetId(null)} title="Delete this contact?" description="This will permanently remove the contact and their associated campaign history. This action cannot be undone." confirmLabel="Delete" onConfirm={actions.deleteContact} /><ContactEditDialog contactId={actions.editContactId} open={actions.editContactId !== null} onOpenChange={(open) => !open && actions.setEditContactId(null)} /><BulkAssignListDialog open={actions.showAssignList} onOpenChange={actions.setShowAssignList} contactIds={[...selectedIds]} onSuccess={actions.completeBulkAction} /><BulkChangeStatusDialog open={actions.showChangeStatus} onOpenChange={actions.setShowChangeStatus} contactIds={[...selectedIds]} onSuccess={actions.completeBulkAction} />
    </div></div>;
}
