"use client";

import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilterBar } from "@/components/shared/filter-bar";

interface EmailFilterBarProps {
  qInput: string;
  filterStatus: string;
  filterQ: string;
  perPage: number;
  onQInputChange: (value: string) => void;
  onSearch: () => void;
  onClearSearch: () => void;
  onStatusChange: (status: string) => void;
  onClearAll: () => void;
  onPerPageChange: (perPage: number) => void;
}

export function EmailFilterBar({
  qInput,
  filterStatus,
  filterQ,
  perPage,
  onQInputChange,
  onSearch,
  onClearSearch,
  onStatusChange,
  onClearAll,
  onPerPageChange,
}: EmailFilterBarProps) {
  return (
    <FilterBar>
      {/* Search — left, grows */}
      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8 pr-8"
          placeholder="Search contact or email..."
          value={qInput}
          onChange={(e) => onQInputChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
        />
        {qInput && (
          <button
            type="button"
            onClick={onClearSearch}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Separator */}
      <div className="hidden h-6 w-px bg-border sm:block" />

      {/* Status filter */}
      <Select
        value={filterStatus || "__all__"}
        onValueChange={(v) => onStatusChange(v === "__all__" ? "" : v)}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All statuses</SelectItem>
          <SelectItem value="sent">Sent</SelectItem>
          <SelectItem value="failed">Failed</SelectItem>
          <SelectItem value="generated">Generated</SelectItem>
          <SelectItem value="skipped">Skipped</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
        </SelectContent>
      </Select>

      {(filterStatus || filterQ) && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1 px-2 text-muted-foreground hover:text-foreground"
          onClick={onClearAll}
        >
          <X className="h-3 w-3" />
          Clear
        </Button>
      )}

      {/* Per page — far right */}
      <div className="ml-auto">
        <Select
          value={String(perPage)}
          onValueChange={(v) => onPerPageChange(Number(v))}
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
      </div>
    </FilterBar>
  );
}
