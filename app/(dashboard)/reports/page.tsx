import { ReportsClient } from "@/components/reports/reports-client";
import { ExportReportButton } from "@/components/reports/export-report-button";
import { TopBar } from "@/components/layout/topbar";

export default function ReportsPage() {
  return (
    <div className="flex flex-col h-full">
      <TopBar title="Reports" hideTitleOnMobile actions={<ExportReportButton />} />
      <main className="flex-1 overflow-y-auto">
        <ReportsClient />
      </main>
    </div>
  );
}
