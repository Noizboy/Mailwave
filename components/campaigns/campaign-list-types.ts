export interface CampaignRow {
  id: string; name: string; status: string; totalEmails: number; sentCount: number; failedCount: number; pendingCount: number; approvalPendingCount: number; skippedCount: number;
  list: { id: string; name: string }; createdAt: string; updatedAt: string; scheduledAt: string | null; startedAt: string | null; completedAt: string | null;
  goal: string | null; product: string | null; cta: string | null; tone: string | null; language: string; emailLength: string; systemPrompt: string | null; intervalType: string; minInterval: number; maxInterval: number; dailyLimit: number; hourlyLimit: number; aiProvider: string | null; aiModel: string | null;
}
