import { TopBar } from "@/components/layout/topbar";
import { DocumentationClient } from "@/components/documentation/documentation-client";

export default function DocumentationPage() {
  return (
    <div className="flex h-full flex-col">
      <TopBar title="Documentation" />
      <main className="min-h-0 flex-1 overflow-hidden">
        <DocumentationClient />
      </main>
    </div>
  );
}
