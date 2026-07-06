import type { BadgeProps } from "@/components/ui/badge";

/**
 * Map an entity status (contact/campaign/etc.) to a Badge variant.
 * The variant name matches the CVA variant defined in components/ui/badge.tsx.
 */
export function getStatusVariant(status: string): NonNullable<BadgeProps["variant"]> {
  const key = status.toLowerCase() as NonNullable<BadgeProps["variant"]>;
  const known: NonNullable<BadgeProps["variant"]>[] = [
    "subscribed", "ready", "ready_to_send", "approved", "connected", "completed",
    "sending",
    "pending", "pending_review", "generating", "paused", "missing_data", "duplicate",
    "failed", "rejected", "invalid", "unsubscribed",
    "suppressed", "skipped", "unlisted", "disconnected",
  ];
  return known.includes(key) ? key : "neutral";
}

/**
 * Legacy shim — returns hex pairs kept for any code that still reads bg/fg directly.
 * New code should use `<Badge variant={getStatusVariant(status)} />` instead.
 */
export function getStatusColors(status: string): { bg: string; fg: string } {
  const map: Record<string, { bg: string; fg: string }> = {
    subscribed:     { bg: "hsl(142 76% 92%)", fg: "hsl(142 71% 32%)" },
    ready:          { bg: "hsl(142 76% 92%)", fg: "hsl(142 71% 32%)" },
    ready_to_send:  { bg: "hsl(142 76% 92%)", fg: "hsl(142 71% 32%)" },
    approved:       { bg: "hsl(142 76% 92%)", fg: "hsl(142 71% 32%)" },
    connected:      { bg: "hsl(142 76% 92%)", fg: "hsl(142 71% 32%)" },
    completed:      { bg: "hsl(142 76% 95%)", fg: "hsl(142 71% 28%)" },
    sending:        { bg: "hsl(217 91% 92%)", fg: "hsl(217 91% 45%)" },
    pending:        { bg: "hsl(45 96% 90%)",  fg: "hsl(38 92% 30%)" },
    pending_review: { bg: "hsl(45 96% 90%)",  fg: "hsl(38 92% 30%)" },
    generating:     { bg: "hsl(45 96% 90%)",  fg: "hsl(38 92% 30%)" },
    paused:         { bg: "hsl(45 96% 90%)",  fg: "hsl(38 92% 30%)" },
    missing_data:   { bg: "hsl(45 96% 90%)",  fg: "hsl(38 92% 30%)" },
    duplicate:      { bg: "hsl(45 96% 90%)",  fg: "hsl(38 92% 30%)" },
    failed:         { bg: "hsl(0 86% 96%)",   fg: "hsl(0 74% 50%)" },
    rejected:       { bg: "hsl(0 86% 96%)",   fg: "hsl(0 74% 50%)" },
    invalid:        { bg: "hsl(0 86% 96%)",   fg: "hsl(0 74% 45%)" },
    unsubscribed:   { bg: "hsl(0 86% 96%)",   fg: "hsl(0 74% 45%)" },
    suppressed:     { bg: "hsl(210 40% 96%)", fg: "hsl(215 16% 47%)" },
    skipped:        { bg: "hsl(210 40% 96%)", fg: "hsl(215 16% 47%)" },
    unlisted:       { bg: "hsl(210 40% 96%)", fg: "hsl(215 16% 47%)" },
    disconnected:   { bg: "hsl(210 40% 96%)", fg: "hsl(215 16% 47%)" },
  };
  return map[status.toLowerCase()] ?? { bg: "hsl(210 40% 96%)", fg: "hsl(215 25% 35%)" };
}
