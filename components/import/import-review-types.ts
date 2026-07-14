export interface ImportRow {
  id: string;
  rowData: Record<string, string>;
  status: "valid" | "invalid" | "duplicate" | "missing_data";
  errorReason: string | null;
  rowIndex: number;
}

export interface ImportData {
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

export type ImportFilter = "all" | ImportRow["status"];
