"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingField } from "./setting-field";
import { toast } from "@/hooks/use-toast";

interface LimitsData {
  dailyLimit: number;
  hourlyLimit: number;
  suppressAfterEmails: number;
}

// Local form state mirrors LimitsData but allows empty strings while the user is typing.
interface LimitsForm {
  dailyLimit: number | "";
  hourlyLimit: number | "";
  suppressAfterEmails: number | "";
}

function limitsToForm(data: LimitsData): LimitsForm {
  return { dailyLimit: data.dailyLimit, hourlyLimit: data.hourlyLimit, suppressAfterEmails: data.suppressAfterEmails };
}

export function SendingLimitsSettings() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<LimitsForm | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: limitsData, isLoading } = useQuery<LimitsData>({
    queryKey: ["settings-limits"],
    queryFn: async () => {
      const res = await fetch("/api/settings/sending-limits");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  // Sync the form whenever fresh data arrives (initial load and post-save refetch).
  // TanStack Query's structural sharing keeps `limitsData` referentially stable when a
  // refetch returns identical values, so this only fires when the values really changed
  // and cannot clobber what the user is typing during a background refetch.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (limitsData) setForm(limitsToForm(limitsData));
  }, [limitsData]);

  const setNum = (key: keyof LimitsForm, value: string) =>
    setForm((f) => f ? { ...f, [key]: value === "" ? "" : (parseInt(value, 10) || "") } : f);

  const handleSave = async () => {
    if (!form) return;
    const payload: LimitsData = {
      dailyLimit: Number(form.dailyLimit) || 1,
      hourlyLimit: Number(form.hourlyLimit) || 1,
      suppressAfterEmails: Number(form.suppressAfterEmails) || 1,
    };
    setSaving(true);
    const res = await fetch("/api/settings/sending-limits", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      toast.success("Sending limits saved", "New rate limits will apply to upcoming campaigns.");
      queryClient.invalidateQueries({ queryKey: ["settings-limits"] });
    } else {
      toast.error("Could not save limits", "An unexpected error occurred. Try again.");
    }
    setSaving(false);
  };

  if (isLoading || !form) {
    return (
      <Card>
        <CardContent className="py-10 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sending Limits</CardTitle>
        <p className="text-sm text-muted-foreground">
          These limits apply to your whole account, across every campaign — they control how fast
          Mailwave sends and how many emails a single contact can receive.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <SettingField label="Max emails per day">
            <Input
              type="number"
              min={1}
              max={2000}
              placeholder="e.g. 50 (safe: 30–100/day)"
              value={form.dailyLimit}
              onChange={(e) => setNum("dailyLimit", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Most emails your account can send in any rolling 24-hour window. When the limit is
              reached, sending pauses and resumes automatically once the window frees up.
            </p>
          </SettingField>
          <SettingField label="Max emails per hour">
            <Input
              type="number"
              min={1}
              max={200}
              placeholder="e.g. 15 (safe: 10–25/hr)"
              value={form.hourlyLimit}
              onChange={(e) => setNum("hourlyLimit", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Same rule over a rolling 60-minute window. Keep it well below your provider&apos;s
              cap so bursts of sending don&apos;t hurt your sender reputation.
            </p>
          </SettingField>
        </div>
        <SettingField label="Auto-suppress after N emails">
          <Input
            type="number"
            min={1}
            max={100}
            placeholder="e.g. 3 (rec. 3–5)"
            value={form.suppressAfterEmails}
            onChange={(e) => setNum("suppressAfterEmails", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Total emails one contact can ever receive from you. When a contact reaches this number
            they are automatically marked as Suppressed and excluded from all future campaigns.
            Saving a lower value also suppresses contacts that are already above the new threshold.
          </p>
        </SettingField>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : "Save Limits"}
        </Button>
      </CardContent>
    </Card>
  );
}
