import { CreateCampaignWizard } from "@/components/campaigns/create-campaign-wizard";
import { TopBar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Suspense } from "react";

export default function CreateCampaignPage() {
  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Create Campaign"
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/campaigns">
              <ChevronLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
        }
      />
      <main className="flex-1 overflow-y-auto p-6">
        <Suspense>
          <CreateCampaignWizard />
        </Suspense>
      </main>
    </div>
  );
}
