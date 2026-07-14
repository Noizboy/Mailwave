"use client";

import { FilterBar } from "@/components/shared/filter-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CampaignFilterBarProps {
  campaignCount: number;
  perPage: number;
  onPerPageChange: (perPage: number) => void;
}

export function CampaignFilterBar({
  campaignCount,
  perPage,
  onPerPageChange,
}: CampaignFilterBarProps) {
  return (
    <FilterBar>
      <span className="text-sm text-muted-foreground">{campaignCount} campaigns</span>
      <div className="flex-1" />
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
    </FilterBar>
  );
}
