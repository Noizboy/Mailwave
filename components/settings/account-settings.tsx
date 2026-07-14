"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingField } from "./setting-field";
import { toast } from "@/hooks/use-toast";

interface AccountData {
  id: string;
  name: string | null;
  email: string;
  createdAt: string;
}

export function AccountSettings() {
  const queryClient = useQueryClient();
  const [name, setName] = useState(() =>
    queryClient.getQueryData<AccountData>(["settings-account"])?.name ?? null
  );
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
  // Populate the name field once when the account loads (render-time
  // adjustment avoids setState-in-effect).
  if (user !== prevUser) {
    setPrevUser(user);
    if (user && name === null) {
      setName(user.name ?? "");
    }
  }

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
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      toast.success("Profile updated", "Your display name has been saved.");
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
