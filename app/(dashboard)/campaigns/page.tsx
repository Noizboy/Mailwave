import { CampaignsClient } from "@/components/campaigns/campaigns-client";
import { TopBar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";

export default function CampaignsPage() {
  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Campaigns"
        actions={
          <Button size="sm" asChild>
            <Link href="/campaigns/create">
              <Plus className="h-4 w-4" />
              Create Campaign
            </Link>
          </Button>
        }
      />
      <main className="flex-1 overflow-y-auto">
        <CampaignsClient />
      </main>
    </div>
  );
}
