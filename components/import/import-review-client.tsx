"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { ImportDestinationListDialog, type ImportDestination } from "./import-destination-list-dialog";
import { ImportReviewBulkActions } from "./import-review-bulk-actions";
import { ImportReviewTable } from "./import-review-table";
import type { ImportData, ImportFilter, ImportRow } from "./import-review-types";

interface FieldCfg { label: string; placeholder?: string; inputClassName?: string; type?: string; textarea?: boolean; fullWidth?: boolean; required?: boolean; hint?: string; }
const FIELD_CONFIG: Record<string, FieldCfg> = {
  firstName: { label: "First name", placeholder: "Daniela", required: true }, lastName: { label: "Last name", placeholder: "Moreno" }, email: { label: "Email address", placeholder: "daniela@nubex.io", required: true, type: "email", inputClassName: "font-mono" }, linkedin: { label: "LinkedIn", placeholder: "linkedin.com/in/…" }, company: { label: "Company", placeholder: "Nubex" }, jobTitle: { label: "Job title", placeholder: "VP Marketing" }, aiHint: { label: "AI Hint", placeholder: "e.g. Mentioned pain with outbound reply rates on LinkedIn. Series B fintech. Interested in LATAM expansion.", inputClassName: "resize-none border-blue-200 bg-blue-50/60", hint: "Used by the AI to personalize this contact's profile & email", textarea: true, fullWidth: true },
};
const FIELD_ORDER = ["firstName", "lastName", "email", "linkedin", "company", "jobTitle", "aiHint"];
async function fetchImport(importId: string): Promise<ImportData> { const response = await fetch(`/api/import/${importId}`); if (!response.ok) throw new Error("Import not found"); return response.json(); }

export function ImportReviewClient({ importId }: { importId: string }) {
  const router = useRouter(); const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["import", importId], queryFn: () => fetchImport(importId) });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editRow, setEditRow] = useState<ImportRow | null>(null);
  const [saving, setSaving] = useState(false); const [showSaveDialog, setShowSaveDialog] = useState(false); const [showDeleteConfirm, setShowDeleteConfirm] = useState(false); const [filter, setFilter] = useState<ImportFilter>("all");
  const { register, handleSubmit, reset: formReset, formState: { isSubmitting } } = useForm<Record<string, string>>();
  if (isLoading) return <div className="space-y-4 p-6"><Skeleton className="h-24" /><Skeleton className="h-96" /></div>;
  if (error || !data) return <div className="p-6 text-center text-sm text-muted-foreground">Import not found. <Button variant="link" className="h-auto p-0" onClick={() => router.push("/upload")}>Start a new import</Button></div>;
  const filteredRows = data.rows.filter((row) => filter === "all" || row.status === filter);
  const allSelected = filteredRows.length > 0 && filteredRows.every((row) => selectedIds.has(row.id));
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["import", importId] });
  const toggleSelect = (id: string) => setSelectedIds((previous) => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const toggleAll = () => setSelectedIds((previous) => { const next = new Set(previous); filteredRows.forEach((row) => allSelected ? next.delete(row.id) : next.add(row.id)); return next; });
  const handleDeleteSelected = async () => { if (selectedIds.size === 0) return; const count = selectedIds.size; const response = await fetch(`/api/import/${importId}/rows`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rowIds: [...selectedIds] }) }); if (response.ok) { toast.success(`${count} row${count === 1 ? "" : "s"} removed`, "The selected rows have been excluded from the import."); setSelectedIds(new Set()); invalidate(); } setShowDeleteConfirm(false); };
  const handleEditSave = async (formData: Record<string, string>) => { if (!editRow) return; const response = await fetch(`/api/import/${importId}/rows`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rowId: editRow.id, rowData: formData }) }); if (response.ok) { toast.success("Row updated", "Your changes have been saved to the import preview."); setEditRow(null); formReset(); invalidate(); } else toast.error("Could not update row", "The row data could not be saved. Try again."); };
  const handleSaveContacts = async (destination: ImportDestination) => { setSaving(true); const response = await fetch(`/api/import/${importId}/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(destination) }); const result = await response.json(); setSaving(false); if (response.ok) { toast.success(`${result.savedCount} contact${result.savedCount === 1 ? "" : "s"} imported`, "They are now available in your Contacts."); router.push("/contacts"); } else toast.error("Import failed", result.error || "Contacts could not be saved. Try again."); };
  const handleCancel = async () => { await fetch(`/api/import/${importId}/cancel`, { method: "POST" }); router.push("/upload"); };
  return <div className="flex h-full flex-col">
    <ImportReviewTable data={data} filter={filter} onFilterChange={setFilter} selectedIds={selectedIds} onToggleSelect={toggleSelect} onToggleAll={toggleAll} onEdit={(row) => { setEditRow(row); formReset(row.rowData); }} bulkActions={<ImportReviewBulkActions selectedCount={selectedIds.size} onDeleteSelected={() => setShowDeleteConfirm(true)} onCancelImport={handleCancel} onSaveContacts={() => setShowSaveDialog(true)} />} />
    <EditRowDialog editRow={editRow} data={data} register={register} handleSubmit={handleSubmit} isSubmitting={isSubmitting} onSave={handleEditSave} onClose={() => setEditRow(null)} />
    <ConfirmDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm} title={`Delete ${selectedIds.size} row${selectedIds.size === 1 ? "" : "s"}?`} description="The selected rows will be removed from this import. This action cannot be undone." confirmLabel="Delete" onConfirm={handleDeleteSelected} />
    <ImportDestinationListDialog open={showSaveDialog} onOpenChange={setShowSaveDialog} validCount={data.validCount} invalidCount={data.invalidCount} duplicateCount={data.duplicateCount} saving={saving} onSave={handleSaveContacts} />
  </div>;
}

function EditRowDialog({ editRow, data, register, handleSubmit, isSubmitting, onSave, onClose }: { editRow: ImportRow | null; data: ImportData; register: ReturnType<typeof useForm<Record<string, string>>>["register"]; handleSubmit: ReturnType<typeof useForm<Record<string, string>>>["handleSubmit"]; isSubmitting: boolean; onSave: (data: Record<string, string>) => Promise<void>; onClose: () => void }) {
  const fieldToCol: Record<string, string> = {}; for (const [csvColumn, field] of Object.entries(data.columnMapping)) fieldToCol[field] = csvColumn;
  const knownFields = new Set(Object.values(data.columnMapping));
  const ordered = editRow ? [...FIELD_ORDER.filter((field) => fieldToCol[field] && fieldToCol[field] in editRow.rowData).map((field) => ({ col: fieldToCol[field], cfg: FIELD_CONFIG[field] })), ...Object.keys(editRow.rowData).filter((column) => !knownFields.has(data.columnMapping[column])).map((col) => ({ col, cfg: { label: col } as FieldCfg }))] : [];
  return <Dialog open={!!editRow} onOpenChange={(open) => !open && onClose()}><DialogContent className="max-w-2xl" onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => event.preventDefault()}><DialogHeader><DialogTitle>Edit Row</DialogTitle></DialogHeader><form onSubmit={handleSubmit(onSave)}><ScrollArea className="max-h-[65vh]"><div className="grid grid-cols-2 gap-4 px-1 pt-1 pb-4">{ordered.map(({ col, cfg }) => <div key={col} className={cn("space-y-1.5", cfg.fullWidth && "col-span-2")}><Label className="flex items-center gap-1.5">{cfg.label}{cfg.required && <span className="text-destructive">*</span>}{cfg.hint && <span className="text-xs font-normal text-muted-foreground">· {cfg.hint}</span>}</Label>{cfg.textarea ? <Textarea rows={7} {...register(col)} placeholder={cfg.placeholder} className={cfg.inputClassName} /> : <Input type={cfg.type} {...register(col)} placeholder={cfg.placeholder} className={cfg.inputClassName} />}</div>)}</div></ScrollArea><div className="mt-4 flex items-center justify-end gap-2 border-t pt-4"><p className="mr-auto text-xs text-muted-foreground">Required fields marked with <span className="text-destructive">*</span></p><Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button><Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving…" : "Save Changes"}</Button></div></form></DialogContent></Dialog>;
}
