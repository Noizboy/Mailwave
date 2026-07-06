import { ReportsClient } from "@/components/reports/reports-client";
import { TopBar } from "@/components/layout/topbar";

export default function ReportsPage() {
  return (
    <div className="flex flex-col h-full">
      <TopBar title="Reports" />
      <main className="flex-1 overflow-y-auto">
        <ReportsClient />
      </main>
    </div>
  );
}
