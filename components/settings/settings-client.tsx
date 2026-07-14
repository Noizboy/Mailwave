"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccountSettings } from "./account-settings";
import { SmtpSettings } from "./smtp-settings";
import { AiSettings } from "./ai-settings";
import { SendingLimitsSettings } from "./limits-settings";
import { NotificationsSettings } from "./notifications-settings";

const TABS = [
  { key: "account", label: "Account" },
  { key: "smtp", label: "Mail Server" },
  { key: "ai", label: "AI Integration" },
  { key: "limits", label: "Sending Limits" },
  { key: "notifications", label: "Notifications" },
];

export function SettingsClient() {
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("tab") ?? "account";
  const [activeTab, setActiveTab] = useState(defaultTab);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Settings</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Configure your sending and AI integrations.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto">
          <TabsList className="w-max">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="smtp" forceMount className="hidden data-[state=active]:block"><SmtpSettings /></TabsContent>
        <TabsContent value="ai" forceMount className="hidden data-[state=active]:block"><AiSettings /></TabsContent>
        <TabsContent value="limits" forceMount className="hidden data-[state=active]:block"><SendingLimitsSettings /></TabsContent>
        <TabsContent value="notifications" forceMount className="hidden data-[state=active]:block"><NotificationsSettings /></TabsContent>
        <TabsContent value="account" forceMount className="hidden data-[state=active]:block"><AccountSettings /></TabsContent>
      </Tabs>
    </div>
  );
}
