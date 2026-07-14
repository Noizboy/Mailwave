import { Edit2 } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { ImportData, ImportFilter, ImportRow } from "./import-review-types";

const statusConfig = {
  valid: { label: "Valid", variant: "ready" as const },
  invalid: { label: "Invalid Email", variant: "invalid" as const },
  duplicate: { label: "Duplicate", variant: "duplicate" as const },
  missing_data: { label: "Missing Data", variant: "missing_data" as const },
};

const filters: ImportFilter[] = ["all", "valid", "invalid", "duplicate", "missing_data"];

interface ImportReviewTableProps {
  data: ImportData;
  filter: ImportFilter;
  onFilterChange: (filter: ImportFilter) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: () => void;
  onEdit: (row: ImportRow) => void;
  bulkActions: ReactNode;
}

export function ImportReviewTable({
  data,
  filter,
  onFilterChange,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  onEdit,
  bulkActions,
}: ImportReviewTableProps) {
  const filteredRows = data.rows.filter((row) => filter === "all" || row.status === filter);
  const allSelected = filteredRows.length > 0 && filteredRows.every((row) => selectedIds.has(row.id));
  const displayCols = Object.keys(data.columnMapping).slice(0, 6);

  return (
    <>
      <div className="border-b bg-background px-3 py-4 sm:px-6">
        <p className="mb-3 text-sm text-muted-foreground">
          Reviewing: <span className="font-medium text-foreground">{data.filename}</span>
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <SummaryChip label="Total" value={data.rowCount} tone="neutral" />
          <SummaryChip label="Valid" value={data.validCount} tone="success" />
          <SummaryChip label="Duplicates" value={data.duplicateCount} tone="warning" />
          <SummaryChip label="Invalid" value={data.invalidCount} tone="destructive" />
          <SummaryChip label="Lists" value={0} tone="info" />
        </div>
      </div>

      <div className="flex flex-col gap-2 border-b bg-background px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-wrap gap-1.5">
          {filters.map((value) => (
            <button
              key={value}
              onClick={() => onFilterChange(value)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                filter === value
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {value === "all" ? "All" : value === "missing_data" ? "Missing Data" : value.charAt(0).toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
        {bulkActions}
      </div>

      <div className="flex-1 overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10 border-b bg-muted/50">
            <tr>
              <th className="w-10 px-4 py-3"><Checkbox checked={allSelected} onCheckedChange={onToggleAll} /></th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              {displayCols.map((col) => <th key={col} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">{col}</th>)}
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredRows.map((row) => {
              const cfg = statusConfig[row.status];
              const isSelected = selectedIds.has(row.id);
              return (
                <tr key={row.id} className={cn("transition-colors hover:bg-muted/40", isSelected && "bg-accent/40")}>
                  <td className="px-4 py-3"><Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect(row.id)} /></td>
                  <td className="px-4 py-3">
                    <Badge variant={cfg.variant}>{cfg.label}</Badge>
                    {row.errorReason && <p className="mt-0.5 text-xs text-destructive">{row.errorReason}</p>}
                  </td>
                  {displayCols.map((col) => <td key={col} className="max-w-[160px] truncate px-4 py-3 text-foreground">{row.rowData[col] || <span className="text-muted-foreground/40">—</span>}</td>)}
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="icon-sm" onClick={() => onEdit(row)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredRows.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">No rows match the current filter.</div>}
      </div>
    </>
  );
}

function SummaryChip({ label, value, tone }: { label: string; value: number; tone: "neutral" | "success" | "warning" | "destructive" | "info" }) {
  return (
    <div className={cn("rounded-lg border p-3 sm:p-4", tone === "neutral" && "border-border bg-muted", tone === "success" && "border-emerald-200 bg-emerald-50", tone === "warning" && "border-amber-200 bg-amber-50", tone === "destructive" && "border-destructive/30 bg-destructive/5", tone === "info" && "border-blue-200 bg-blue-50")}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:text-[11px]">{label}</div>
      <div className={cn("mt-1 text-xl font-semibold tabular-nums sm:text-2xl", tone === "neutral" && "text-foreground", tone === "success" && "text-emerald-700", tone === "warning" && "text-amber-700", tone === "destructive" && "text-destructive", tone === "info" && "text-blue-700")}>{value}</div>
    </div>
  );
}
