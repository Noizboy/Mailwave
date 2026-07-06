import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide leading-none whitespace-nowrap transition-colors",
  {
    variants: {
      variant: {
        default: "bg-secondary text-secondary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        outline: "border border-input text-foreground bg-transparent",
        destructive: "bg-destructive/10 text-destructive",
        success: "bg-emerald-100 text-emerald-700",
        warning: "bg-amber-100 text-amber-700",
        info: "bg-blue-100 text-blue-700",
        neutral: "bg-muted text-muted-foreground",

        // Contact / campaign status
        subscribed: "bg-emerald-100 text-emerald-700",
        ready: "bg-emerald-100 text-emerald-700",
        ready_to_send: "bg-emerald-100 text-emerald-700",
        approved: "bg-emerald-100 text-emerald-700",
        connected: "bg-emerald-100 text-emerald-700",
        completed: "bg-emerald-50 text-emerald-800",

        sending: "bg-blue-100 text-blue-700",

        pending: "bg-amber-100 text-amber-800",
        pending_review: "bg-amber-100 text-amber-800",
        generating: "bg-amber-100 text-amber-800",
        paused: "bg-amber-100 text-amber-800",
        missing_data: "bg-amber-100 text-amber-800",
        duplicate: "bg-amber-100 text-amber-800",

        failed: "bg-red-50 text-destructive",
        rejected: "bg-red-50 text-destructive",
        invalid: "bg-red-50 text-red-700",
        unsubscribed: "bg-red-50 text-red-700",

        suppressed: "bg-muted text-muted-foreground",
        skipped: "bg-muted text-muted-foreground",
        unlisted: "bg-muted text-muted-foreground",
        disconnected: "bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  );
}

export { badgeVariants };
export default Badge;
