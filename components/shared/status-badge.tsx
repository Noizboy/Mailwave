import { Badge } from "@/components/ui/badge";
import { getStatusVariant } from "@/lib/status-colors";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

function formatLabel(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <Badge variant={getStatusVariant(status)} className={className}>
      {formatLabel(status)}
    </Badge>
  );
}
