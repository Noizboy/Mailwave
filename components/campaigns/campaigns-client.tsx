"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Mail, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataPagination } from "@/components/shared/data-pagination";
import { CampaignsFilterBar } from "./campaigns-filter-bar";
import { CampaignsTable } from "./campaigns-table";
import type { CampaignRow } from "./campaign-list-types";
import { useCampaignListActions } from "./use-campaign-list-actions";

async function fetchCampaigns(): Promise<CampaignRow[]> { const response = await fetch("/api/campaigns"); if (!response.ok) throw new Error("Failed to load campaigns"); return response.json(); }

export function CampaignsClient() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set()); const [search, setSearch] = useState(""); const [statusFilter, setStatusFilter] = useState("all"); const [page, setPage] = useState(1); const [perPage, setPerPage] = useState(50);
  const { data: campaigns = [], isLoading } = useQuery({ queryKey: ["campaigns"], queryFn: fetchCampaigns });
  const filtered = campaigns.filter((campaign) => (campaign.name.toLowerCase().includes(search.toLowerCase()) || campaign.list.name.toLowerCase().includes(search.toLowerCase())) && (statusFilter === "all" || campaign.status === statusFilter)); const totalPages = Math.ceil(filtered.length / perPage); const paginated = filtered.slice((page - 1) * perPage, page * perPage); const startRow = filtered.length > 0 ? (page - 1) * perPage + 1 : 0; const endRow = Math.min(page * perPage, filtered.length);
  const resetPage = (update: () => void) => { update(); setPage(1); }; const toggleSelect = (id: string) => setSelectedIds((previous) => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; }); const toggleAll = () => setSelectedIds(selectedIds.size === paginated.length ? new Set() : new Set(paginated.map((campaign) => campaign.id)));
  const actions = useCampaignListActions(selectedIds, () => setSelectedIds(new Set()));
  if (isLoading) return <div className="space-y-4 p-6"><Skeleton className="h-10 w-full" /><Skeleton className="h-80 w-full" /></div>;
  return <div><CampaignsFilterBar search={search} status={statusFilter} perPage={perPage} selectedCount={selectedIds.size} onSearchChange={(value) => resetPage(() => setSearch(value))} onStatusChange={(value) => resetPage(() => setStatusFilter(value))} onPerPageChange={(value) => { setPerPage(value); setPage(1); }} onDeleteSelected={() => actions.setShowBulkDeleteConfirm(true)} /><div className="space-y-4 p-6">{campaigns.length === 0 ? <Card><CardContent><EmptyState icon={Mail} title="No campaigns yet" description="Create your first AI-personalized campaign." action={<Button size="sm" asChild><Link href="/campaigns/create"><Plus className="h-4 w-4" />Create Campaign</Link></Button>} /></CardContent></Card> : <Card><CampaignsTable campaigns={paginated} selectedIds={selectedIds} onToggleAll={toggleAll} onToggleSelect={toggleSelect} onRename={actions.startRename} onDuplicate={actions.duplicateCampaign} duplicatingId={actions.duplicatingId} onDelete={actions.setDeletingId} /></Card>}{filtered.length > 0 && <div className="flex items-center justify-between text-sm text-muted-foreground"><span>Showing {startRow}–{endRow} of {filtered.length}</span><DataPagination page={page} totalPages={totalPages} onPageChange={setPage} /></div>}</div><ConfirmDialog open={actions.showBulkDeleteConfirm} onOpenChange={actions.setShowBulkDeleteConfirm} title={`Delete ${selectedIds.size} campaign${selectedIds.size === 1 ? "" : "s"}?`} description="This will permanently remove the selected campaigns along with their generated emails and send history. This action cannot be undone." confirmLabel="Delete" onConfirm={actions.deleteSelected} /><ConfirmDialog open={!!actions.deletingId} onOpenChange={(open) => !open && actions.setDeletingId(null)} title="Delete campaign?" description="This will permanently remove this campaign along with its generated emails and send history. This action cannot be undone." confirmLabel="Delete" onConfirm={actions.deleteCampaign} /><ConfirmDialog open={!!actions.renameId} onOpenChange={(open) => !open && actions.closeRename()} title="Rename campaign" description={<Input value={actions.renameName} onChange={(event) => actions.setRenameName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") actions.renameCampaign(); }} placeholder="Campaign name" className="mt-2" autoFocus />} confirmLabel="Rename" onConfirm={actions.renameCampaign} /></div>;
}
