import { prisma } from "@/lib/prisma";
import {
  buildSystemPrompt,
  buildUserPrompt,
  generateEmail,
  resolveAiConfig,
  type AiProviderName,
  type ResolvedAiConfig,
} from "@/lib/ai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotifPrefs = Record<string, boolean>;

/**
 * Minimal campaign shape consumed by the generate orchestrator and stages.
 * Mirrors the fields the original monolithic worker read off the campaign row.
 */
export type GenerateCampaignRef = {
  id: string;
  name: string;
  listId: string | null;
  goal: string | null;
  product: string | null;
  cta: string | null;
  tone: string | null;
  language: string;
  emailLength: string;
  aiProvider: string | null;
  aiModel: string | null;
  systemPrompt: string | null;
  status: string;
};

/** Contact fields required to build a per-contact user prompt and persist the row. */
export type EligibleContact = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  jobTitle: string | null;
  aiHint: string | null;
  customFields: unknown;
};

/**
 * Pre-resolved generation context shared across every per-contact iteration:
 * the system prompt, the validated AI config, and a snapshot of existing
 * campaign emails keyed by contactId (avoids N+1 lookups in the loop).
 */
export type GenerationContext = {
  systemPrompt: string;
  resolved: ResolvedAiConfig;
  existingByContact: Map<string, { status: string; approvalStatus: string }>;
};

/**
 * Outcome of attempting to generate one contact's email. The generation stage
 * never throws for a per-contact failure — it returns a discriminable outcome
 * so the orchestrator can count, persist, and decide aborts uniformly.
 *
 *  - `generated`: AI call succeeded and the email row was upserted.
 *  - `failed`:    any error (per-contact or service-level) — a failed email row
 *                  was persisted and the batch continues with the next contact.
 */
export type ContactOutcome =
  | { kind: "generated" }
  | { kind: "failed"; error: Error };

export type ResolveGenerationAiConfigResult =
  | { ok: true; config: ResolvedAiConfig }
  | { ok: false; error: Error };

// ---------------------------------------------------------------------------
// Stage 1: Load campaign + claim the run
// ---------------------------------------------------------------------------

/**
 * Load the campaign (tenant-scoped) and flip it to "generating" so the UI and
 * any concurrent cancel path can observe the in-flight run. Throws when the
 * campaign does not exist for this user.
 */
export async function loadCampaignForGeneration(
  campaignId: string,
  userId: string
): Promise<GenerateCampaignRef> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, userId },
  });
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "generating" },
  });

  return campaign as unknown as GenerateCampaignRef;
}

// ---------------------------------------------------------------------------
// Stage 2: Load eligible contacts
// ---------------------------------------------------------------------------

/**
 * Fetch subscribed contacts belonging to the campaign's list, returning only
 * the contact fields the generator needs (prompts + persistence keys).
 */
export async function loadEligibleContacts(
  campaign: GenerateCampaignRef,
  userId: string
): Promise<EligibleContact[]> {
  if (!campaign.listId) return [];
  const members = await prisma.listMember.findMany({
    where: {
      listId: campaign.listId,
      contact: { userId, status: "subscribed" },
    },
    include: {
      contact: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          company: true,
          jobTitle: true,
          aiHint: true,
          customFields: true,
        },
      },
    },
  });
  return members.map((m) => m.contact as EligibleContact);
}

// ---------------------------------------------------------------------------
// Stage 3: Resolve + validate the AI config (MT-H4)
// ---------------------------------------------------------------------------

/**
 * Resolve the user's connected AI config (optionally pinned to the campaign's
 * requested provider) and run it through the shared `resolveAiConfig` boundary
 * (MT-H4): decrypts the key, resolves model/base URL, and re-validates a
 * user-supplied custom base URL to close the DNS-rebinding / TOCTOU window
 * (CN-005, CWE-918). Returns a discriminated result so the orchestrator can
 * map failures to a campaign failure + throw without losing the reason.
 */
export async function resolveGenerationAiConfig(
  userId: string,
  campaign: GenerateCampaignRef
): Promise<ResolveGenerationAiConfigResult> {
  const requestedProviderName = (campaign.aiProvider ?? null) as string | null;
  const aiConfig = await prisma.aiConfig.findFirst({
    where: {
      userId,
      ...(requestedProviderName ? { provider: requestedProviderName as AiProviderName } : {}),
      status: "connected",
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!aiConfig) {
    return { ok: false, error: new Error("No connected AI config found") };
  }

  const resolved = await resolveAiConfig(aiConfig, { modelOverride: campaign.aiModel });
  if (!resolved.ok) {
    const message =
      resolved.error.code === "unsafe-base-url"
        ? `AI base URL rejected: ${resolved.error.message}`
        : resolved.error.message;
    return { ok: false, error: new Error(message) };
  }

  return { ok: true, config: resolved.config };
}

// ---------------------------------------------------------------------------
// Stage 4: Build the shared generation context
// ---------------------------------------------------------------------------

/**
 * Build the campaign-level system prompt and pre-fetch existing campaign
 * emails into a contact-keyed map. Both are computed once and reused across
 * every per-contact iteration to avoid N+1 lookups in the loop.
 */
export async function buildGenerationContext(
  campaign: GenerateCampaignRef,
  resolved: ResolvedAiConfig
): Promise<GenerationContext> {
  const systemPrompt = buildSystemPrompt({
    goal: campaign.goal,
    product: campaign.product,
    cta: campaign.cta,
    tone: campaign.tone,
    language: campaign.language,
    emailLength: campaign.emailLength,
    basePrompt: campaign.systemPrompt,
  });

  const existingEmails = await prisma.campaignEmail.findMany({
    where: { campaignId: campaign.id },
    select: { contactId: true, status: true, approvalStatus: true },
  });
  const existingByContact = new Map(existingEmails.map((e) => [e.contactId, e]));

  return { systemPrompt, resolved, existingByContact };
}

/** True when the contact already has a generated or deliberately-skipped email. */
export function isAlreadyHandled(
  ctx: GenerationContext,
  contactId: string
): boolean {
  const existing = ctx.existingByContact.get(contactId);
  return !!existing && (existing.status !== "pending" || existing.approvalStatus === "skipped");
}

// ---------------------------------------------------------------------------
// Stage 5: Generate + persist one contact's email (never throws)
// ---------------------------------------------------------------------------

// 3 retries = 4 total attempts; exponential backoff: 2s → 4s → 8s
const CONTACT_MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2_000;

/**
 * Build the per-contact user prompt, call the AI provider, and persist the
 * result. Never throws — a per-contact failure is returned as a `failed`
 * outcome (with the failed row already persisted) so the batch can continue;
 * a service-level failure is returned as `service-error` (no row persisted) so
 * the orchestrator can abort the run rather than failing every remaining
 * contact. Provider calls are strictly sequential — the orchestrator invokes
 * this once per contact.
 *
 * Non-service errors (e.g. empty/malformed JSON from the AI) are retried up to
 * CONTACT_MAX_RETRIES times with exponential backoff before the contact is
 * marked failed.
 */
export async function generateForContact(
  campaignId: string,
  contact: EligibleContact,
  ctx: GenerationContext
): Promise<ContactOutcome> {
  const { provider, model, apiKey, baseUrl } = ctx.resolved;
  const userPrompt = buildUserPrompt({
    email: contact.email,
    firstName: contact.firstName,
    lastName: contact.lastName,
    company: contact.company,
    jobTitle: contact.jobTitle,
    aiHint: contact.aiHint,
    customFields: contact.customFields as Record<string, string> | null,
  });

  let lastErr: Error | undefined;

  for (let attempt = 0; attempt <= CONTACT_MAX_RETRIES; attempt++) {
    try {
      const result = await generateEmail({
        provider,
        model,
        apiKey,
        baseUrl,
        systemPrompt: ctx.systemPrompt,
        userPrompt,
      });

      await prisma.campaignEmail.upsert({
        where: { campaignId_contactId: { campaignId, contactId: contact.id } },
        create: {
          campaignId,
          contactId: contact.id,
          subject: result.subject,
          body: result.body,
          personalizationNotes: result.personalizationNotes,
          promptUsed: userPrompt,
          modelUsed: model,
          generatedAt: new Date(),
          status: "generated",
          approvalStatus: "pending",
        },
        update: {
          subject: result.subject,
          body: result.body,
          personalizationNotes: result.personalizationNotes,
          promptUsed: userPrompt,
          modelUsed: model,
          generatedAt: new Date(),
          status: "generated",
          approvalStatus: "pending",
        },
      });

      return { kind: "generated" };
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error("Unknown error");

      if (attempt < CONTACT_MAX_RETRIES) {
        // Exponential backoff: 2s, 4s, 8s
        await new Promise((res) => setTimeout(res, RETRY_BASE_DELAY_MS * Math.pow(2, attempt)));
      }
    }
  }

  // All retries exhausted — persist the failure so the batch can continue.
  const errorReason = lastErr!.message;
  await prisma.campaignEmail.upsert({
    where: { campaignId_contactId: { campaignId, contactId: contact.id } },
    create: {
      campaignId,
      contactId: contact.id,
      status: "failed",
      approvalStatus: "pending",
      errorReason,
    },
    update: {
      status: "failed",
      errorReason,
    },
  });
  return { kind: "failed", error: lastErr! };
}

// ---------------------------------------------------------------------------
// Cancellation probe
// ---------------------------------------------------------------------------

/**
 * Re-read the campaign status to honor an external cancel issued via the UI
 * while the run is in flight. Returns true when the run no longer owns the
 * "generating" status and the orchestrator should stop processing.
 */
export async function isGenerationCancelled(campaignId: string): Promise<boolean> {
  const fresh = await prisma.campaign.findFirst({
    where: { id: campaignId },
    select: { status: true },
  });
  return fresh?.status !== "generating";
}

// ---------------------------------------------------------------------------
// Run-level side effects: failure, finalization, notifications
// ---------------------------------------------------------------------------

/**
 * Classify an AI provider error into a short machine-readable code so the UI
 * can show specific recovery guidance instead of a generic message.
 *
 *  - "auth"        → 401/403, invalid or expired API key
 *  - "rate_limit"  → 429, quota or session limit exceeded
 *  - "no_contacts" → list is empty or no subscribed contacts
 *  - "service"     → all other service-level failures
 */
export function classifyGenerationError(err: Error): string {
  const msg = err.message.toLowerCase();
  if (msg.includes("401") || msg.includes("403") || msg.includes("invalid api key") ||
      msg.includes("unauthorized") || msg.includes("authentication") ||
      msg.includes("api key") || msg.includes("apikey")) {
    return "auth";
  }
  if (msg.includes("429") || msg.includes("rate limit") || msg.includes("usage limit") ||
      msg.includes("quota") || msg.includes("session usage")) {
    return "rate_limit";
  }
  return "service";
}

/** Mark the campaign `failed` and store the error reason for UI display. */
export async function markCampaignFailed(
  campaignId: string,
  errorCode?: string
): Promise<void> {
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "failed", lastGenerationError: errorCode ?? null },
  });
}

/**
 * Mark the campaign `failed` and emit a `campaign.generation_failed`
 * notification when the user's `ai_email_error` preference allows it. Shared
 * by the service-error abort and the no-eligible-contacts paths — the caller
 * supplies the title/body so each path's notification content is preserved.
 */
export async function failGenerationRunAndNotify(args: {
  campaignId: string;
  userId: string;
  campaignName: string;
  title: string;
  body: string;
  prefs: NotifPrefs;
  errorCode?: string;
}): Promise<void> {
  const { campaignId, userId, campaignName, title, body, prefs, errorCode } = args;
  await markCampaignFailed(campaignId, errorCode);
  if (prefs.ai_email_error) {
    await prisma.notification.create({
      data: {
        userId,
        type: "campaign.generation_failed",
        title,
        body,
        entityType: "campaign",
        entityId: campaignId,
      },
    });
  }
}

/**
 * Transition the campaign to `pending_review` — only if it still owns the
 * "generating" status, so a concurrent cancel is a no-op rather than being
 * overwritten. Reconciles the email counters from the run.
 */
export async function finalizeGeneration(args: {
  campaignId: string;
  userId: string;
  campaignName: string;
  totalEmails: number;
  successCount: number;
  failCount: number;
  prefs: NotifPrefs;
}): Promise<void> {
  const { campaignId, userId, campaignName, totalEmails, successCount, failCount, prefs } = args;

  await prisma.campaign.updateMany({
    where: { id: campaignId, status: "generating" },
    data: {
      status: "pending_review",
      totalEmails,
      pendingCount: successCount,
      failedCount: failCount,
    },
  });

  if (prefs.ai_email_ready) {
    await prisma.notification.create({
      data: {
        userId,
        type: "campaign.generation_complete",
        title: `"${campaignName}" is ready for review`,
        body: `${successCount} email${successCount !== 1 ? "s" : ""} generated successfully. Go review and approve them before sending.`,
        entityType: "campaign",
        entityId: campaignId,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Service-error classification (GEN-002)
// ---------------------------------------------------------------------------

/**
 * Classify an error as a service-level failure that should abort the whole
 * batch rather than failing each remaining contact individually. Covers OpenAI
 * / Anthropic SDK status codes (429, 401, 403, 5xx), abort/timeout error
 * names, and common network failure message fragments.
 */
export function isServiceError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  const name = err.name.toLowerCase();

  // OpenAI / Anthropic SDKs expose a .status property on API errors.
  // 429 (rate limit), 401/403 (auth) and 5xx all mean the whole batch
  // is unrecoverable — abort early rather than failing every contact.
  const status = (err as { status?: number }).status;
  if (typeof status === "number" && (status >= 500 || status === 429 || status === 401 || status === 403)) return true;

  return (
    name === "aborterror" || // AbortSignal.timeout fired
    name === "timeouterror" ||
    name === "apiconnectionerror" ||
    name === "apiconnectiontimeouterror" ||
    name === "apiuseraborderror" ||
    name === "internalservererror" ||
    name === "autherror" ||
    name === "authenticationerror" ||
    msg.includes("timeout") ||
    msg.includes("aborted") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("fetch failed") ||
    msg.includes("socket hang up") ||
    msg.includes("network") ||
    msg.includes("service unavailable") ||
    msg.includes("bad gateway") ||
    msg.includes("gateway timeout") ||
    msg.includes("401") ||
    msg.includes("unauthorized") ||
    msg.includes("invalid api key") ||
    msg.includes("authentication")
  );
}
