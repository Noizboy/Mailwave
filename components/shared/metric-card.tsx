import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

interface MetricCardProps {
  label: string;
  value: string | number;
  delta?: string;
  deltaTone?: "positive" | "negative" | "neutral";
  href?: string;
  icon?: LucideIcon;
  className?: string;
}

export function MetricCard({
  label,
  value,
  delta,
  deltaTone = "neutral",
  href,
  icon: Icon,
  className,
}: MetricCardProps) {
  const content = (
    <Card
      className={cn(
        "p-4 transition-colors",
        href && "hover:border-primary/60 hover:shadow",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </div>
      {delta && (
        <div
          className={cn(
            "mt-1 text-xs font-medium",
            deltaTone === "positive" && "text-emerald-600",
            deltaTone === "negative" && "text-destructive",
            deltaTone === "neutral" && "text-muted-foreground"
          )}
        >
          {delta}
        </div>
      )}
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }
  return content;
}
