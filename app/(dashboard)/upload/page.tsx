import { UploadCsvClient } from "@/components/import/upload-csv-client";
import { TopBar } from "@/components/layout/topbar";

export default function UploadPage() {
  return (
    <div className="flex flex-col h-full">
      <TopBar title="Upload CSV" />
      <main className="flex-1 overflow-y-auto p-6">
        <UploadCsvClient />
      </main>
    </div>
  );
}
