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

  // Sync form from DB whenever fresh data arrives (covers initial load and post-save refetch).
  // We only overwrite if form is null (initial) or after a save resets it to null.
  useEffect(() => {
    // One-time seed from the query cache: guarded by `form === null`, so it runs
    // once when data first arrives and cannot cascade (the setState-in-effect
    // rule can't see the guard). Deliberate, hence both suppressions.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (limitsData && form === null) setForm(limitsToForm(limitsData));
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // Reset to null so the useEffect repopulates from the fresh DB values.
      setForm(null);
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
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <SettingField label="Max emails per day">
            <Input
              type="number"
              min={1}
              value={form.dailyLimit}
              onChange={(e) => setNum("dailyLimit", e.target.value)}
            />
          </SettingField>
          <SettingField label="Max emails per hour">
            <Input
              type="number"
              min={1}
              value={form.hourlyLimit}
              onChange={(e) => setNum("hourlyLimit", e.target.value)}
            />
          </SettingField>
        </div>
        <SettingField label="Auto-suppress after N emails">
          <Input
            type="number"
            min={1}
            value={form.suppressAfterEmails}
            onChange={(e) => setNum("suppressAfterEmails", e.target.value)}
          />
        </SettingField>
        <p className="text-xs text-muted-foreground">
          When a contact reaches this limit they are automatically marked as Suppressed and excluded from all future campaigns.
        </p>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : "Save Limits"}
        </Button>
      </CardContent>
    </Card>
  );
}
