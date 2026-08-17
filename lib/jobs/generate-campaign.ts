import { Worker, Job } from "bullmq";
import { prisma } from "@/lib/prisma";
import { QUEUE_NAMES } from "./queue";
import { getNotifPrefs } from "./notification-prefs";
import { logger } from "@/lib/logger";
import {
  buildGenerationContext,
  classifyGenerationError,
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
    const errorCode = err instanceof Error ? classifyGenerationError(err) : "service";
    await prisma.campaign.updateMany({
      where: { id: campaignId, status: "generating" },
      data: { status: "failed", lastGenerationError: errorCode },
    }).catch(() => {}); // best-effort — don't mask the original error
    throw err;
  }
}

async function runGeneration(
  job: Job<GenerateCampaignJobData>,
  campaignId: string,
  userId: string
): Promise<{ successCount: number; failCount: number }> {
  const tag = `[generate:${campaignId}]`;

  // --- Stage 1: load campaign + mark generating ---
  const campaign = await loadCampaignForGeneration(campaignId, userId);
  console.log(`${tag} Starting generation for campaign "${campaign.name}"`);
  logger.info("campaign", `Generation started for "${campaign.name}"`, { campaignId }, userId);

  // Fetch notification prefs once for the whole job.
  const prefs: NotifPrefs = await getNotifPrefs(userId, ["ai_email_ready", "ai_email_error"]);

  // --- Stage 2: load eligible contacts ---
  const contacts = await loadEligibleContacts(campaign, userId);
  console.log(`${tag} Eligible contacts: ${contacts.length}`);

  // --- Stage 3: resolve + validate AI config (MT-H4) ---
  const aiConfig = await resolveGenerationAiConfig(userId, campaign);
  if (!aiConfig.ok) {
    console.error(`${tag} AI config resolution failed:`, aiConfig.error.message);
    logger.error("ai", `AI config resolution failed for campaign "${campaign.name}"`, { campaignId, error: aiConfig.error.message }, userId);
    await markCampaignFailed(campaignId, classifyGenerationError(aiConfig.error));
    throw aiConfig.error;
  }
  console.log(`${tag} AI config resolved — provider: ${aiConfig.config.provider}, model: ${aiConfig.config.model}`);

  // --- Stage 4: build shared generation context ---
  // Built unconditionally (matches original behavior): the system prompt and
  // existing-email snapshot are computed before the empty-contacts short-circuit
  // below, so a no-op run still incurs the same prep work.
  const ctx: GenerationContext = await buildGenerationContext(campaign, aiConfig.config);

  // No eligible contacts → fail the run and notify (when the pref allows).
  if (contacts.length === 0) {
    console.warn(`${tag} No eligible contacts — aborting`);
    logger.warn("campaign", `No eligible contacts for campaign "${campaign.name}"`, { campaignId }, userId);
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
      console.log(`${tag} Cancelled — stopping at ${successCount} ok / ${failCount} failed`);
      return { successCount, failCount };
    }

    // Skip contacts already generated or deliberately skipped by the user.
    if (isAlreadyHandled(ctx, contact.id)) continue;

    const outcome = await generateForContact(campaignId, contact, ctx);

    if (outcome.kind === "generated") {
      successCount++;
    } else if (outcome.kind === "failed") {
      failCount++;
      console.error(`${tag} Contact ${contact.id} (${contact.email}) failed: ${outcome.error.message}`);
      logger.error("ai", `Email generation failed for contact ${contact.email}`, { campaignId, contactId: contact.id, error: outcome.error.message, provider: aiConfig.config.provider, model: aiConfig.config.model }, userId);
    } else {
      // Service-level failure: abort the whole run rather than failing every
      // remaining contact. No email row was persisted for this contact.
      console.error(`${tag} Service error — aborting run: ${outcome.error.message}`);
      logger.error("ai", `AI service error — generation aborted for "${campaign.name}"`, { campaignId, error: outcome.error.message }, userId);
      const errorCode = classifyGenerationError(outcome.error);
      await failGenerationRunAndNotify({
        campaignId,
        userId,
        campaignName: campaign.name,
        title: "AI service unreachable",
        body: `Generation stopped for "${campaign.name}": ${outcome.error.message}. Check your AI configuration and try again.`,
        prefs,
        errorCode,
      });
      return { successCount, failCount };
    }

    // Report progress after each contact.
    await job.updateProgress(
      Math.round(((successCount + failCount) / contacts.length) * 100)
    );
  }

  // --- Stage 6: finalize → pending_review + completion notification ---
  console.log(`${tag} Generation complete — ${successCount} ok / ${failCount} failed / ${contacts.length} total`);
  logger.info("campaign", `Generation complete for "${campaign.name}"`, { campaignId, successCount, failCount, total: contacts.length }, userId);
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
