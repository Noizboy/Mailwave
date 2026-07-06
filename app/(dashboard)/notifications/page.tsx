import { TopBar } from "@/components/layout/topbar";
import { NotificationsClient } from "@/components/notifications/notifications-client";

export default function NotificationsPage() {
  return (
    <div className="flex flex-col h-full">
      <TopBar title="Notifications" />
      <main className="flex-1 overflow-y-auto p-6">
        <NotificationsClient />
      </main>
    </div>
  );
}
