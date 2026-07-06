import { SettingsClient } from "@/components/settings/settings-client";
import { TopBar } from "@/components/layout/topbar";
import { Suspense } from "react";

export default function SettingsPage() {
  return (
    <div className="flex flex-col h-full">
      <TopBar title="Settings" />
      <main className="flex-1 overflow-y-auto p-6">
        <Suspense>
          <SettingsClient />
        </Suspense>
      </main>
    </div>
  );
}
