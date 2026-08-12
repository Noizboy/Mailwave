"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SettingField } from "./setting-field";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Timezone list
// ---------------------------------------------------------------------------

function getUtcOffset(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "UTC";
  } catch {
    return "UTC";
  }
}

const TIMEZONE_OPTIONS: { value: string; label: string; offset: string }[] =
  (() => {
    try {
      return Intl.supportedValuesOf("timeZone").map((tz) => ({
        value: tz,
        label: tz.replace(/_/g, " "),
        offset: getUtcOffset(tz),
      }));
    } catch {
      return [{ value: "UTC", label: "UTC", offset: "UTC" }];
    }
  })();

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AccountData {
  id: string;
  name: string | null;
  email: string;
  timezone: string;
  createdAt: string;
}

export function AccountSettings() {
  const queryClient = useQueryClient();
  const [name, setName] = useState<string | null>(
    () =>
      queryClient.getQueryData<AccountData>(["settings-account"])?.name ?? null
  );
  const [timezone, setTimezone] = useState<string>(
    () =>
      queryClient.getQueryData<AccountData>(["settings-account"])?.timezone ??
      "UTC"
  );
  const [tzOpen, setTzOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  const { data: user, isLoading } = useQuery<AccountData>({
    queryKey: ["settings-account"],
    queryFn: async () => {
      const res = await fetch("/api/settings/account");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const [prevUser, setPrevUser] = useState(user);
  if (user !== prevUser) {
    setPrevUser(user);
    if (user) {
      if (name === null) setName(user.name ?? "");
      setTimezone(user.timezone ?? "UTC");
    }
  }

  const selectedTzLabel = useMemo(() => {
    const opt = TIMEZONE_OPTIONS.find((o) => o.value === timezone);
    return opt ? `${opt.label} (${opt.offset})` : timezone;
  }, [timezone]);

  if (isLoading || name === null) {
    return (
      <Card>
        <CardContent className="py-10 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const handleSaveProfile = async () => {
    setSaving(true);
    const res = await fetch("/api/settings/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, timezone }),
    });
    if (res.ok) {
      toast.success("Profile updated", "Your display name and timezone have been saved.");
      queryClient.invalidateQueries({ queryKey: ["settings-account"] });
    } else {
      toast.error("Could not update profile", "An unexpected error occurred. Try again.");
    }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (newPw !== confirmPw) {
      toast.error("Passwords don't match", "The new password and confirmation must be identical.");
      return;
    }
    setChangingPw(true);
    const res = await fetch("/api/settings/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
    });
    if (res.ok) {
      toast.success("Password changed", "Your new password is active. Use it on your next login.");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } else {
      const err = await res.json();
      toast.error("Could not change password", err.error ?? "Check your current password and try again.");
    }
    setChangingPw(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingField label="Full Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </SettingField>
          <SettingField label="Email">
            <Input value={user?.email ?? ""} disabled className="bg-gray-50 text-gray-500" />
          </SettingField>
          <SettingField
            label="Timezone"
            description="Used for sending time windows and other time-based scheduling across your account."
          >
            <Popover open={tzOpen} onOpenChange={setTzOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={tzOpen}
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate">{selectedTzLabel}</span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search timezone..." />
                  <CommandList className="max-h-64">
                    <CommandEmpty>No timezone found.</CommandEmpty>
                    <CommandGroup>
                      {TIMEZONE_OPTIONS.map((opt) => (
                        <CommandItem
                          key={opt.value}
                          value={`${opt.label} ${opt.offset} ${opt.value}`}
                          onSelect={() => {
                            setTimezone(opt.value);
                            setTzOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              timezone === opt.value ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span className="flex-1 truncate">{opt.label}</span>
                          <span className="ml-2 text-xs text-muted-foreground shrink-0">
                            {opt.offset}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </SettingField>
          <Button onClick={handleSaveProfile} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : "Save Profile"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingField label="Current Password">
            <Input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              placeholder="Current password"
            />
          </SettingField>
          <SettingField label="New Password">
            <Input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="At least 8 characters"
            />
          </SettingField>
          <SettingField label="Confirm New Password">
            <Input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="Repeat new password"
            />
          </SettingField>
          <Button
            onClick={handleChangePassword}
            disabled={changingPw || !currentPw || !newPw || !confirmPw}
          >
            {changingPw ? <><Loader2 className="h-4 w-4 animate-spin" /> Changing...</> : "Change Password"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
