import { ImportReviewClient } from "@/components/import/import-review-client";
import { TopBar } from "@/components/layout/topbar";

export default async function ImportReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="flex flex-col h-full">
      <TopBar title="Review Import" />
      <main className="flex-1 overflow-y-auto">
        <ImportReviewClient importId={id} />
      </main>
    </div>
  );
}
