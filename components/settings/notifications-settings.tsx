"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

const NOTIF_DEFAULTS: Record<string, boolean> = {
  campaign_complete: true,
  campaign_error: true,
  ai_email_ready: false,
  ai_email_error: true,
  email_bounced: true,
  daily_digest: false,
  system_alerts: true,
  low_credits: true,
};

// system_alerts and low_credits have no backend implementation yet
const RESERVED_KEYS = new Set(["system_alerts", "low_credits"]);

const NOTIF_GROUPS = [
  {
    label: "Campaigns",
    items: [
      {
        key: "campaign_complete",
        label: "Campaign completed",
        description: "Notify me when all emails in a campaign have been sent.",
      },
      {
        key: "campaign_error",
        label: "Campaign error",
        description: "Notify me when a campaign fails to send due to a configuration problem.",
      },
    ],
  },
  {
    label: "AI",
    items: [
      {
        key: "ai_email_ready",
        label: "AI emails ready for review",
        description: "Notify me when AI has finished generating emails and they are ready to review.",
      },
      {
        key: "ai_email_error",
        label: "AI generation failed",
        description: "Notify me when AI email generation fails, for example due to an API error.",
      },
    ],
  },
  {
    label: "Delivery",
    items: [
      {
        key: "email_bounced",
        label: "Email bounced",
        description: "Notify me when an email is rejected by the recipient's mail server.",
      },
      {
        key: "daily_digest",
        label: "Daily delivery digest",
        description: "Receive a daily summary of emails sent and failed across all campaigns.",
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        key: "system_alerts",
        label: "System alerts",
        description: "Important notices about your account, such as security or service updates.",
      },
      {
        key: "low_credits",
        label: "Low sending credits",
        description: "Notify me when my remaining sending quota is running low.",
      },
    ],
  },
];

export function NotificationsSettings() {
  const queryClient = useQueryClient();
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});

  const { data: prefs, isLoading } = useQuery<Record<string, boolean>>({
    queryKey: ["settings-notification-prefs"],
    queryFn: async () => {
      const res = await fetch("/api/settings/notification-preferences");
      if (!res.ok) throw new Error("Failed to load preferences");
      return res.json();
    },
  });

  const merged = { ...NOTIF_DEFAULTS, ...prefs, ...optimistic };

  const toggle = async (key: string) => {
    const newValue = !merged[key];
    setOptimistic((o) => ({ ...o, [key]: newValue }));
    try {
      const res = await fetch("/api/settings/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType: key, inApp: newValue }),
      });
      if (!res.ok) throw new Error("Failed");
      queryClient.invalidateQueries({ queryKey: ["settings-notification-prefs"] });
    } catch {
      // Revert optimistic update on error
      setOptimistic((o) => ({ ...o, [key]: !newValue }));
      toast.error("Could not save preference", "Try again.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        {NOTIF_GROUPS.map((g) => (
          <Card key={g.label}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{g.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {g.items.map((item) => (
                <div key={item.key} className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="h-4 w-36 rounded bg-muted animate-pulse" />
                    <div className="h-3 w-56 rounded bg-muted animate-pulse" />
                  </div>
                  <div className="h-5 w-9 rounded-full bg-muted animate-pulse mt-0.5 shrink-0" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {NOTIF_GROUPS.map((g) => (
        <Card key={g.label}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{g.label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {g.items.map((item) => {
              const reserved = RESERVED_KEYS.has(item.key);
              return (
                <div key={item.key} className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground flex items-center gap-2">
                      {item.label}
                      {reserved && (
                        <span className="text-xs font-normal text-muted-foreground">(coming soon)</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                  <Switch
                    checked={!!merged[item.key]}
                    onCheckedChange={() => !reserved && toggle(item.key)}
                    disabled={reserved}
                    aria-label={item.label}
                    className="mt-0.5 shrink-0"
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
