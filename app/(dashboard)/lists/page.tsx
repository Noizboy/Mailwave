import { ListsClient } from "@/components/lists/lists-client";
import { TopBar } from "@/components/layout/topbar";

export default function ListsPage() {
  return (
    <div className="flex flex-col h-full">
      <TopBar title="Lists" />
      <main className="flex-1 overflow-y-auto">
        <ListsClient />
      </main>
    </div>
  );
}
