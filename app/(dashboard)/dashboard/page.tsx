import { TopBar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Upload, Plus } from "lucide-react";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

export default function DashboardPage() {
  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Dashboard"
        actions={
          <div className="hidden md:flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/upload">
                <Upload className="h-4 w-4" />
                Upload CSV
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/campaigns/create">
                <Plus className="h-4 w-4" />
                Create Campaign
              </Link>
            </Button>
          </div>
        }
      />
      <main className="flex-1 overflow-y-auto p-6">
        <DashboardClient />
      </main>
    </div>
  );
}
