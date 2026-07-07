"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Edit2, Save, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface ImportRow {
  id: string;
  rowData: Record<string, string>;
  status: "valid" | "invalid" | "duplicate" | "missing_data";
  errorReason: string | null;
  rowIndex: number;
}

interface ImportData {
  id: string;
  filename: string;
  rowCount: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  columnMapping: Record<string, string>;
  rows: ImportRow[];
  status: string;
}

const statusConfig = {
  valid: { label: "Valid", variant: "ready" as const },
  invalid: { label: "Invalid Email", variant: "invalid" as const },
  duplicate: { label: "Duplicate", variant: "duplicate" as const },
  missing_data: { label: "Missing Data", variant: "missing_data" as const },
};

interface FieldCfg {
  label: string;
  placeholder?: string;
  inputClassName?: string;
  type?: string;
  textarea?: boolean;
  fullWidth?: boolean;
  required?: boolean;
  hint?: string;
}

const FIELD_CONFIG: Record<string, FieldCfg> = {
  firstName: { label: "First name",    placeholder: "Daniela",           required: true },
  lastName:  { label: "Last name",     placeholder: "Moreno" },
  email:     { label: "Email address", placeholder: "daniela@nubex.io",  required: true, type: "email", inputClassName: "font-mono" },
  linkedin:  { label: "LinkedIn",      placeholder: "linkedin.com/in/…" },
  company:   { label: "Company",       placeholder: "Nubex" },
  jobTitle:  { label: "Job title",     placeholder: "VP Marketing" },
  aiHint: {
    label: "AI Hint",
    placeholder: "e.g. Mentioned pain with outbound reply rates on LinkedIn. Series B fintech. Interested in LATAM expansion.",
    inputClassName: "resize-none border-blue-200 bg-blue-50/60",
    hint: "Used by the AI to personalize this contact's profile & email",
    textarea: true,
    fullWidth: true,
  },
};

// Explicit render order — same sequence as Edit Contact form
const FIELD_ORDER = ["firstName", "lastName", "email", "linkedin", "company", "jobTitle", "aiHint"];

async function fetchImport(importId: string): Promise<ImportData> {
  const res = await fetch(`/api/import/${importId}`);
  if (!res.ok) throw new Error("Import not found");
  return res.json();
}

export function ImportReviewClient({ importId }: { importId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["import", importId],
    queryFn: () => fetchImport(importId),
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editRow, setEditRow] = useState<ImportRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [listMode, setListMode] = useState<"none" | "existing" | "new">("none");
  const [selectedListId, setSelectedListId] = useState("");
  const [newListName, setNewListName] = useState("");

  const { data: existingLists = [] } = useQuery<{ id: string; name: string; totalContacts: number }[]>({
    queryKey: ["lists"],
    queryFn: () => fetch("/api/lists").then((r) => r.json()),
    enabled: showSaveDialog,
  });
  const [filter, setFilter] = useState<
    "all" | "valid" | "invalid" | "duplicate" | "missing_data"
  >("all");

  const {
    register,
    handleSubmit,
    reset: formReset,
    formState: { isSubmitting },
  } = useForm<Record<string, string>>();

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-24" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Import not found.{" "}
        <Button variant="link" className="h-auto p-0" onClick={() => router.push("/upload")}>
          Start a new import
        </Button>
      </div>
    );
  }

  const filteredRows = data.rows.filter(
    (r) => filter === "all" || r.status === filter
  );
  const allSelected =
    filteredRows.length > 0 && filteredRows.every((r) => selectedIds.has(r.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredRows.forEach((r) => next.delete(r.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredRows.forEach((r) => next.add(r.id));
        return next;
      });
    }
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["import", importId] });

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    const res = await fetch(`/api/import/${importId}/rows`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowIds: [...selectedIds] }),
    });
    if (res.ok) {
      toast.success(`${count} row${count === 1 ? "" : "s"} removed`, "The selected rows have been excluded from the import.");
      setSelectedIds(new Set());
      invalidate();
    }
    setShowDeleteConfirm(false);
  };

  const handleEditSave = async (formData: Record<string, string>) => {
    if (!editRow) return;
    const res = await fetch(`/api/import/${importId}/rows`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowId: editRow.id, rowData: formData }),
    });
    if (res.ok) {
      toast.success("Row updated", "Your changes have been saved to the import preview.");
      setEditRow(null);
      formReset();
      invalidate();
    } else {
      toast.error("Could not update row", "The row data could not be saved. Try again.");
    }
  };

  const handleSaveContacts = async () => {
    setSaving(true);
    const payload =
      listMode === "existing" && selectedListId
        ? { listId: selectedListId }
        : listMode === "new" && newListName.trim()
        ? { createListName: newListName.trim() }
        : {};
    const res = await fetch(`/api/import/${importId}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = await res.json();
    setSaving(false);
    if (res.ok) {
      toast.success(`${d.savedCount} contact${d.savedCount === 1 ? "" : "s"} imported`, "They are now available in your Contacts.");
      router.push("/contacts");
    } else {
      toast.error("Import failed", d.error || "Contacts could not be saved. Try again.");
    }
  };

  const handleCancel = async () => {
    await fetch(`/api/import/${importId}/cancel`, { method: "POST" });
    router.push("/upload");
  };

  const displayCols = Object.keys(data.columnMapping).slice(0, 6);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b bg-background px-3 py-4 sm:px-6">
        <p className="mb-3 text-sm text-muted-foreground">
          Reviewing:{" "}
          <span className="font-medium text-foreground">{data.filename}</span>
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <SummaryChip label="Total" value={data.rowCount} tone="neutral" />
          <SummaryChip label="Valid" value={data.validCount} tone="success" />
          <SummaryChip label="Duplicates" value={data.duplicateCount} tone="warning" />
          <SummaryChip label="Invalid" value={data.invalidCount} tone="destructive" />
          <SummaryChip label="Lists" value={0} tone="info" />
        </div>
      </div>

      {/* Filter + Bulk Actions */}
      <div className="flex flex-col gap-2 border-b bg-background px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-wrap gap-1.5">
          {(
            ["all", "valid", "invalid", "duplicate", "missing_data"] as const
          ).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                filter === f
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {f === "all"
                ? "All"
                : f === "missing_data"
                ? "Missing Data"
                : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedIds.size > 0 && (
            <>
              <span className="text-xs text-muted-foreground">
                {selectedIds.size} selected
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Delete Selected</span>
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={handleCancel}>
            <X className="h-4 w-4" />
            <span className="hidden sm:inline">Cancel Import</span>
          </Button>
          <Button size="sm" onClick={() => setShowSaveDialog(true)}>
            <Save className="h-4 w-4" />
            Save Contacts
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10 border-b bg-muted/50">
            <tr>
              <th className="w-10 px-4 py-3">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </th>
              {displayCols.map((col) => (
                <th
                  key={col}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {col}
                </th>
              ))}
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredRows.map((row) => {
              const cfg = statusConfig[row.status];
              const isSelected = selectedIds.has(row.id);
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "transition-colors hover:bg-muted/40",
                    isSelected && "bg-accent/40"
                  )}
                >
                  <td className="px-4 py-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(row.id)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={cfg.variant}>{cfg.label}</Badge>
                    {row.errorReason && (
                      <p className="mt-0.5 text-xs text-destructive">
                        {row.errorReason}
                      </p>
                    )}
                  </td>
                  {displayCols.map((col) => (
                    <td
                      key={col}
                      className="max-w-[160px] truncate px-4 py-3 text-foreground"
                    >
                      {row.rowData[col] || (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        setEditRow(row);
                        formReset(row.rowData);
                      }}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredRows.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No rows match the current filter.
          </div>
        )}
      </div>

      {/* Edit Row Dialog */}
      <Dialog open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent
          className="max-w-2xl"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Edit Row</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(handleEditSave)}>
            <ScrollArea className="max-h-[65vh]">
              <div className="grid grid-cols-2 gap-4 px-1 pt-1 pb-4">
                {editRow &&
                  (() => {
                    // Build reverse map: contactField -> csvColumn
                    const fieldToCol: Record<string, string> = {};
                    for (const [csvCol, field] of Object.entries(data.columnMapping)) {
                      fieldToCol[field] = csvCol;
                    }
                    const knownFields = new Set(Object.values(data.columnMapping));
                    // Known fields in explicit order, then any unmapped custom columns
                    const ordered = [
                      ...FIELD_ORDER
                        .filter((f) => fieldToCol[f] && fieldToCol[f] in editRow.rowData)
                        .map((f) => ({ col: fieldToCol[f], cfg: FIELD_CONFIG[f] })),
                      ...Object.keys(editRow.rowData)
                        .filter((col) => !knownFields.has(data.columnMapping[col]))
                        .map((col) => ({ col, cfg: { label: col } as FieldCfg })),
                    ];
                    return ordered.map(({ col, cfg }) => (
                      <div key={col} className={cn("space-y-1.5", cfg.fullWidth && "col-span-2")}>
                        <Label className="flex items-center gap-1.5">
                          {cfg.label}
                          {cfg.required && <span className="text-destructive">*</span>}
                          {cfg.hint && (
                            <span className="text-xs font-normal text-muted-foreground">
                              · {cfg.hint}
                            </span>
                          )}
                        </Label>
                        {cfg.textarea ? (
                          <Textarea
                            rows={7}
                            {...register(col)}
                            placeholder={cfg.placeholder}
                            className={cfg.inputClassName}
                          />
                        ) : (
                          <Input
                            type={cfg.type}
                            {...register(col)}
                            placeholder={cfg.placeholder}
                            className={cfg.inputClassName}
                          />
                        )}
                      </div>
                    ));
                  })()}
              </div>
            </ScrollArea>

            <div className="mt-4 flex items-center justify-end gap-2 border-t pt-4">
              <p className="mr-auto text-xs text-muted-foreground">
                Required fields marked with <span className="text-destructive">*</span>
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditRow(null)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={`Delete ${selectedIds.size} row${selectedIds.size === 1 ? "" : "s"}?`}
        description="The selected rows will be removed from this import. This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDeleteSelected}
      />

      {/* Save Dialog */}
      <Dialog
        open={showSaveDialog}
        onOpenChange={(o) => {
          setShowSaveDialog(o);
          if (!o) {
            setListMode("none");
            setSelectedListId("");
            setNewListName("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Contacts</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-emerald-700">{data.validCount}</span>{" "}
              valid contacts will be saved.
              {data.invalidCount + data.duplicateCount > 0 && (
                <span> ({data.invalidCount + data.duplicateCount} invalid/duplicate rows will be skipped.)</span>
              )}
            </p>

            <div className="space-y-1.5">
              <Label>Assign to a list</Label>
              <div className="flex rounded-md border overflow-hidden">
                {(["none", "existing", "new"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setListMode(mode)}
                    className={cn(
                      "flex-1 px-3 py-2 text-xs font-medium transition-colors",
                      listMode === mode
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {mode === "none" ? "No list" : mode === "existing" ? "Existing list" : "New list"}
                  </button>
                ))}
              </div>
            </div>

            {listMode === "existing" && (
              <div className="space-y-1.5">
                <Label>Select list</Label>
                <Select value={selectedListId} onValueChange={setSelectedListId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a list…" />
                  </SelectTrigger>
                  <SelectContent>
                    {existingLists.map((list) => (
                      <SelectItem key={list.id} value={list.id}>
                        {list.name}
                        <span className="ml-1.5 text-muted-foreground">
                          ({list.totalContacts})
                        </span>
                      </SelectItem>
                    ))}
                    {existingLists.length === 0 && (
                      <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                        No lists found. Create one instead.
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {listMode === "new" && (
              <div className="space-y-1.5">
                <Label>New list name</Label>
                <Input
                  placeholder="e.g. Tech Leaders Q1"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveContacts}
              disabled={
                saving ||
                (listMode === "existing" && !selectedListId) ||
                (listMode === "new" && !newListName.trim())
              }
            >
              {saving
                ? "Saving…"
                : listMode === "new"
                ? "Create List & Save"
                : listMode === "existing"
                ? "Add to List & Save"
                : "Save Contacts"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "success" | "warning" | "destructive" | "info";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 sm:p-4",
        tone === "neutral" && "border-border bg-muted",
        tone === "success" && "border-emerald-200 bg-emerald-50",
        tone === "warning" && "border-amber-200 bg-amber-50",
        tone === "destructive" && "border-destructive/30 bg-destructive/5",
        tone === "info" && "border-blue-200 bg-blue-50"
      )}
    >
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:text-[11px]">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums sm:text-2xl",
          tone === "neutral" && "text-foreground",
          tone === "success" && "text-emerald-700",
          tone === "warning" && "text-amber-700",
          tone === "destructive" && "text-destructive",
          tone === "info" && "text-blue-700"
        )}
      >
        {value}
      </div>
    </div>
  );
}
