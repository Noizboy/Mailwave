import { prisma } from "@/lib/prisma";
import {
  generateEmail,
  buildSystemPrompt,
  buildUserPrompt,
  resolveAiConfig,
} from "@/lib/ai";

/**
 * Regenerate a single campaign email's subject or body via the user's
 * connected AI config.
 *
 * MT-M2: extracted from the regenerate route so the route is a thin HTTP
 * adapter. The route loads the campaign + email (ownership) and maps the
 * result; this function owns the AI config lookup, prompt construction,
 * generation call, and email update.
 *
 * Returns a discriminated union so the route keeps full control of the HTTP
 * status and body. `status: 400` covers missing/invalid AI config; `status:
 * 500` covers provider call failures.
 */

export type RegenerateTarget = "subject" | "body";

/** Campaign fields needed to build the system prompt. */
export interface CampaignPromptContext {
  goal: string | null;
  product: string | null;
  cta: string | null;
  tone: string | null;
  language: string;
  emailLength: string;
  systemPrompt: string | null;
}

/** Contact fields needed to build the user prompt. */
export interface ContactPromptContext {
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  jobTitle: string | null;
  aiHint: string | null;
  customFields: Record<string, string> | null;
}

export type RegenerateEmailResult =
  | { ok: true; subject: string | null; body: string | null }
  | { ok: false; status: 400; error: string }
  | { ok: false; status: 500; error: string };

export async function regenerateCampaignEmail(input: {
  userId: string;
  emailId: string;
  campaign: CampaignPromptContext;
  contact: ContactPromptContext;
  target: RegenerateTarget;
}): Promise<RegenerateEmailResult> {
  const aiConfig = await prisma.aiConfig.findFirst({
    where: { userId: input.userId, status: "connected" },
    orderBy: { updatedAt: "desc" },
  });
  if (!aiConfig) {
    return { ok: false, status: 400, error: "No connected AI config" };
  }

  // Resolve + validate the AI config through the shared boundary (MT-H4):
  // decrypts the key, requires an explicitly configured model (no
  // DEFAULT_MODELS fallback — a stale campaign.aiModel previously caused
  // 404s), and validates custom base URLs (SSRF / DNS-rebinding — CN-005).
  const resolved = await resolveAiConfig(aiConfig, { requireModel: true });
  if (!resolved.ok) {
    const error =
      resolved.error.code === "unsafe-base-url"
        ? resolved.error.message ?? "AI base URL not allowed."
        : "No connected AI config";
    return { ok: false, status: 400, error };
  }

  const { provider, model, apiKey, baseUrl } = resolved.config;

  const systemPrompt = buildSystemPrompt({
    goal: input.campaign.goal,
    product: input.campaign.product,
    cta: input.campaign.cta,
    tone: input.campaign.tone,
    language: input.campaign.language,
    emailLength: input.campaign.emailLength,
    basePrompt: input.campaign.systemPrompt,
  });

  const userPrompt = buildUserPrompt({
    email: input.contact.email,
    firstName: input.contact.firstName,
    lastName: input.contact.lastName,
    company: input.contact.company,
    jobTitle: input.contact.jobTitle,
    aiHint: input.contact.aiHint,
    customFields: input.contact.customFields,
  });

  try {
    const result = await generateEmail({
      provider,
      model,
      apiKey,
      baseUrl,
      systemPrompt,
      userPrompt,
    });

    const updateData =
      input.target === "subject"
        ? { subject: result.subject, modelUsed: model }
        : {
            body: result.body,
            personalizationNotes: result.personalizationNotes,
            promptUsed: userPrompt,
            modelUsed: model,
            generatedAt: new Date(),
            status: "generated" as const,
            approvalStatus: "pending" as const,
            errorReason: null,
          };

    const updated = await prisma.campaignEmail.update({
      where: { id: input.emailId },
      data: updateData,
    });

    return { ok: true, subject: updated.subject, body: updated.body };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: err instanceof Error ? err.message : "Generation failed",
    };
  }
}
