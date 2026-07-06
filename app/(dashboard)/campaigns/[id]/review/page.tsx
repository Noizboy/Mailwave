import { CampaignReviewClient } from "@/components/campaigns/campaign-review-client";
import { TopBar } from "@/components/layout/topbar";

export default async function CampaignReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title="Review Emails" />
      <div className="flex-1 overflow-hidden">
        <CampaignReviewClient campaignId={id} />
      </div>
    </div>
  );
}
