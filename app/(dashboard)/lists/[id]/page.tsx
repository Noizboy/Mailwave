import { ListDetailClient } from "@/components/lists/list-detail-client";
import { TopBar } from "@/components/layout/topbar";

export default async function ListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="flex flex-col h-full">
      <TopBar title="List Detail" />
      <main className="flex-1 overflow-y-auto p-6">
        <ListDetailClient listId={id} />
      </main>
    </div>
  );
}
