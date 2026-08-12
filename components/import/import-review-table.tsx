import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ImportData, ImportRow } from "./import-review-types";

const statusConfig = {
  valid: { label: "Valid", variant: "ready" as const },
  invalid: { label: "Invalid Email", variant: "invalid" as const },
  duplicate: { label: "Duplicate", variant: "duplicate" as const },
  missing_data: { label: "Missing Data", variant: "missing_data" as const },
};

interface ImportReviewTableProps {
  data: ImportData;
  filteredRows: ImportRow[];
  allSelected: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: () => void;
  onEdit: (row: ImportRow) => void;
}

export function ImportReviewTable({ data, filteredRows, allSelected, selectedIds, onToggleSelect, onToggleAll, onEdit }: ImportReviewTableProps) {
  const fieldToCol = Object.fromEntries(
    Object.entries(data.columnMapping).map(([col, field]) => [field, col])
  );
  const getField = (row: ImportRow, field: string): string | null => {
    const col = fieldToCol[field];
    return col ? (row.rowData[col] || null) : null;
  };
  const hasJobTitle = "jobTitle" in fieldToCol;
  const hasLinkedIn = "linkedin" in fieldToCol;

  return (
    <CardContent className="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10"><Checkbox checked={allSelected} onCheckedChange={onToggleAll} /></TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Company</TableHead>
            {hasJobTitle && <TableHead>Job Title</TableHead>}
            {hasLinkedIn && <TableHead>LinkedIn</TableHead>}
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredRows.map((row) => {
            const cfg = statusConfig[row.status];
            const isSelected = selectedIds.has(row.id);
            const firstName = getField(row, "firstName");
            const lastName = getField(row, "lastName");
            const displayName = [firstName, lastName].filter(Boolean).join(" ") || null;
            return (
              <TableRow
                key={row.id}
                data-state={isSelected ? "selected" : undefined}
                className={cn(isSelected && "bg-accent/40")}
              >
                <TableCell><Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect(row.id)} /></TableCell>
                <TableCell>
                  <Badge variant={cfg.variant}>{cfg.label}</Badge>
                  {row.errorReason && <p className="mt-0.5 text-xs text-destructive">{row.errorReason}</p>}
                </TableCell>
                <TableCell className="font-mono text-xs">{getField(row, "email") ?? <span className="text-muted-foreground/40">—</span>}</TableCell>
                <TableCell className="font-medium">{displayName ?? <span className="text-muted-foreground/40">—</span>}</TableCell>
                <TableCell className="text-muted-foreground">{getField(row, "company") ?? <span className="text-muted-foreground/40">—</span>}</TableCell>
                {hasJobTitle && <TableCell className="text-muted-foreground">{getField(row, "jobTitle") ?? <span className="text-muted-foreground/40">—</span>}</TableCell>}
                {hasLinkedIn && <TableCell className="text-muted-foreground max-w-[160px] truncate">{getField(row, "linkedin") ?? <span className="text-muted-foreground/40">—</span>}</TableCell>}
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon-sm" onClick={() => onEdit(row)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {filteredRows.length === 0 && (
        <div className="py-12 text-center text-sm text-muted-foreground">No rows match the current filter.</div>
      )}
    </CardContent>
  );
}

export function SummaryChip({ label, value, tone }: { label: string; value: number; tone: "neutral" | "success" | "warning" | "destructive" | "info" }) {
  return (
    <div className={cn("rounded-lg border p-3 sm:p-4", tone === "neutral" && "border-border bg-muted", tone === "success" && "border-emerald-200 bg-emerald-50", tone === "warning" && "border-amber-200 bg-amber-50", tone === "destructive" && "border-destructive/30 bg-destructive/5", tone === "info" && "border-blue-200 bg-blue-50")}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:text-[11px]">{label}</div>
      <div className={cn("mt-1 text-xl font-semibold tabular-nums sm:text-2xl", tone === "neutral" && "text-foreground", tone === "success" && "text-emerald-700", tone === "warning" && "text-amber-700", tone === "destructive" && "text-destructive", tone === "info" && "text-blue-700")}>{value}</div>
    </div>
  );
}
