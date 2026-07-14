import { Worker, Job } from "bullmq";
import { prisma } from "@/lib/prisma";
import { QUEUE_NAMES } from "./queue";
import { getNotifPrefs } from "./notification-prefs";
import {
  buildGenerationContext,
  failGenerationRunAndNotify,
  finalizeGeneration,
  generateForContact,
  isAlreadyHandled,
  isGenerationCancelled,
  loadCampaignForGeneration,
  loadEligibleContacts,
  markCampaignFailed,
  resolveGenerationAiConfig,
  type GenerationContext,
  type NotifPrefs,
} from "./generate-campaign-stages";

export interface GenerateCampaignJobData {
  campaignId: string;
  userId: string;
}

/**
 * Worker entry point. The flow is expressed as a short sequence of stages:
 *   1. Load the campaign and mark it "generating".
 *   2. Load eligible subscribed contacts for the campaign's list.
 *   3. Resolve + validate the AI config through the shared MT-H4 boundary.
 *   4. Build the shared generation context (system prompt + existing emails).
 *   5. For each contact: probe cancellation, skip already-handled rows, then
 *      generate + persist one email (sequentially — provider calls are never
 *      parallelized, per MT-M7 risk notes).
 *   6. Finalize: transition to `pending_review` and notify.
 * The orchestrator owns the loop, progress reporting, abort decisions, and
 * run finalization; per-contact generation/persistence is delegated to
 * `generateForContact` with a clear outcome contract.
 */
export async function processGenerate(job: Job<GenerateCampaignJobData>) {
  const { campaignId, userId } = job.data;

  try {
    return await runGeneration(job, campaignId, userId);
  } catch (err) {
    // Ensure the campaign never stays stuck in "generating" if an unexpected
    // error occurs. updateMany is guarded by status:"generating" so a
    // concurrent cancel is a no-op rather than being overwritten.
    await prisma.campaign.updateMany({
      where: { id: campaignId, status: "generating" },
      data: { status: "failed" },
    }).catch(() => {}); // best-effort — don't mask the original error
    throw err;
  }
}

async function runGeneration(
  job: Job<GenerateCampaignJobData>,
  campaignId: string,
  userId: string
): Promise<{ successCount: number; failCount: number }> {
  // --- Stage 1: load campaign + mark generating ---
  const campaign = await loadCampaignForGeneration(campaignId, userId);

  // Fetch notification prefs once for the whole job.
  const prefs: NotifPrefs = await getNotifPrefs(userId, ["ai_email_ready", "ai_email_error"]);

  // --- Stage 2: load eligible contacts ---
  const contacts = await loadEligibleContacts(campaign, userId);

  // --- Stage 3: resolve + validate AI config (MT-H4) ---
  const aiConfig = await resolveGenerationAiConfig(userId, campaign);
  if (!aiConfig.ok) {
    await markCampaignFailed(campaignId);
    throw aiConfig.error;
  }

  // --- Stage 4: build shared generation context ---
  // Built unconditionally (matches original behavior): the system prompt and
  // existing-email snapshot are computed before the empty-contacts short-circuit
  // below, so a no-op run still incurs the same prep work.
  const ctx: GenerationContext = await buildGenerationContext(campaign, aiConfig.config);

  // No eligible contacts → fail the run and notify (when the pref allows).
  if (contacts.length === 0) {
    await failGenerationRunAndNotify({
      campaignId,
      userId,
      campaignName: campaign.name,
      title: "Generation failed",
      body: `No eligible contacts found in the list for campaign "${campaign.name}".`,
      prefs,
    });
    return { successCount: 0, failCount: 0 };
  }

  // --- Stage 5: per-contact generation (sequential) ---
  let successCount = 0;
  let failCount = 0;

  for (const contact of contacts) {
    // Honor an external cancel issued via the UI while the run is in flight.
    if (await isGenerationCancelled(campaignId)) {
      return { successCount, failCount };
    }

    // Skip contacts already generated or deliberately skipped by the user.
    if (isAlreadyHandled(ctx, contact.id)) continue;

    const outcome = await generateForContact(campaignId, contact, ctx);

    if (outcome.kind === "generated") {
      successCount++;
    } else if (outcome.kind === "failed") {
      failCount++;
    } else {
      // Service-level failure: abort the whole run rather than failing every
      // remaining contact. No email row was persisted for this contact.
      await failGenerationRunAndNotify({
        campaignId,
        userId,
        campaignName: campaign.name,
        title: "AI service unreachable",
        body: `Generation stopped for "${campaign.name}": the AI service is unavailable or timed out. Check your AI configuration and try again.`,
        prefs,
      });
      return { successCount, failCount };
    }

    // Report progress after each contact.
    await job.updateProgress(
      Math.round(((successCount + failCount) / contacts.length) * 100)
    );
  }

  // --- Stage 6: finalize → pending_review + completion notification ---
  await finalizeGeneration({
    campaignId,
    userId,
    campaignName: campaign.name,
    totalEmails: contacts.length,
    successCount,
    failCount,
    prefs,
  });

  return { successCount, failCount };
}

export function startGenerateWorker() {
  const worker = new Worker(QUEUE_NAMES.generate, processGenerate, {
    connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379" },
    concurrency: 2,
    // Generous lock window for large contact lists; BullMQ auto-renews while active
    lockDuration: 300_000, // 5 min
    lockRenewTime: 120_000, // renew every 2 min
  });

  worker.on("failed", (job, err) => {
    console.error(`Generate job ${job?.id} failed:`, err.message);
  });

  return worker;
}
