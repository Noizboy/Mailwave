import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { decrypt } from "@/lib/crypto";
import { assertSafeHost } from "@/lib/ssrf";

export type AiProviderName = "openai" | "anthropic" | "google_gemini" | "openrouter" | "custom";

export const PROVIDER_BASE_URLS: Record<string, string> = {
  google_gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  openrouter: "https://openrouter.ai/api/v1",
};

export const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5-20251001",
  google_gemini: "gemini-1.5-flash",
  openrouter: "openai/gpt-4o-mini",
  custom: "gpt-4o-mini",
};

// ─── AI config resolution boundary (MT-H4) ───────────────────────────────────
//
// Centralizes provider/model/base URL/key resolution and custom base URL
// validation so the three primary consumers (campaign generation worker,
// single-email regenerate route, and AI settings test route) cannot drift.
// Prompt construction stays separate (see buildSystemPrompt / buildUserPrompt).

/**
 * Structural view of a stored AiConfig row — only the fields the resolver needs.
 * Consumers fetch the row themselves (their queries differ) and pass it here.
 */
export interface RawAiConfig {
  provider: string;
  model: string | null;
  encryptedApiKey: string | null;
  baseUrl: string | null;
}

/** Ready-to-use AI configuration: decrypted key, resolved model, validated base URL. */
export interface ResolvedAiConfig {
  provider: AiProviderName;
  model: string;
  apiKey: string;
  baseUrl: string | undefined;
}

export type ResolveAiConfigErrorCode = "no-api-key" | "no-model" | "unsafe-base-url";

export interface ResolveAiConfigError {
  code: ResolveAiConfigErrorCode;
  /** Consumer-facing reason from the underlying check (e.g. assertSafeHost reason). */
  message: string;
}

export type ResolveAiConfigResult =
  | { ok: true; config: ResolvedAiConfig }
  | { ok: false; error: ResolveAiConfigError };

export interface ResolveAiConfigOptions {
  /**
   * Per-call model override (e.g. campaign.aiModel). When provided and non-null,
   * takes priority over the stored model and DEFAULT_MODELS.
   */
  modelOverride?: string | null;
  /**
   * When true, a missing stored model is a hard error instead of falling back to
   * DEFAULT_MODELS. The regenerate route requires an explicitly configured model.
   */
  requireModel?: boolean;
}

/**
 * Resolves a ready-to-use AI configuration from a stored AiConfig row:
 * decrypts the API key, resolves the model (override → stored → default),
 * resolves the base URL (custom → built-in provider URL → undefined), and
 * validates user-supplied custom base URLs via assertSafeHost to close the
 * DNS-rebinding / TOCTOU window (CN-005, CWE-918). Built-in provider URLs
 * (PROVIDER_BASE_URLS) are trusted and skip the SSRF check.
 *
 * Returns a discriminated union so each consumer can map errors to its own
 * HTTP status / throw message without losing the structured reason.
 */
export async function resolveAiConfig(
  raw: RawAiConfig,
  options: ResolveAiConfigOptions = {}
): Promise<ResolveAiConfigResult> {
  if (!raw.encryptedApiKey) {
    return {
      ok: false,
      error: { code: "no-api-key", message: "AI config has no API key stored" },
    };
  }

  const provider = raw.provider as AiProviderName;

  if (options.requireModel && !raw.model) {
    return {
      ok: false,
      error: { code: "no-model", message: "AI config has no model configured" },
    };
  }

  const model = options.modelOverride ?? raw.model ?? DEFAULT_MODELS[provider] ?? "gpt-4o-mini";
  const apiKey = decrypt(raw.encryptedApiKey);
  const baseUrl = raw.baseUrl ?? PROVIDER_BASE_URLS[provider] ?? undefined;

  if (raw.baseUrl) {
    const hostCheck = await assertSafeHost(raw.baseUrl);
    if (!hostCheck.ok) {
      return {
        ok: false,
        error: { code: "unsafe-base-url", message: hostCheck.reason ?? "unsafe host" },
      };
    }
  }

  return { ok: true, config: { provider, model, apiKey, baseUrl } };
}

export interface AiGenerationInput {
  provider: AiProviderName;
  model: string;
  apiKey: string;
  baseUrl?: string;
  systemPrompt: string;
  userPrompt: string;
  timeoutMs?: number;
}

export interface AiGenerationResult {
  subject: string;
  body: string;
  personalizationNotes: string;
}

export async function generateEmail(input: AiGenerationInput): Promise<AiGenerationResult> {
  const fullPrompt = `${input.userPrompt}

CRITICAL: Write the actual, ready-to-send email. NEVER use placeholder text anywhere in the body - not [Your Name], [Your Company], [Your Contact Information], [Tu nombre], [Tu empresa], [Tu informacion de contacto], or any bracket placeholder. Use the real sender name from the instructions, or omit the field entirely.

Respond with ONLY a JSON object in this exact format (no markdown, no code fences):
{
  "subject": "The email subject line",
  "body": "The complete, ready-to-send email body with no placeholders. Use \\n for newlines.",
  "personalizationNotes": "Brief note on how this email was personalized for this contact"
}`;

  const signal = AbortSignal.timeout(input.timeoutMs ?? 30_000);
  let content: string;

  if (input.provider === "anthropic") {
    const client = new Anthropic({ apiKey: input.apiKey });
    const message = await client.messages.create(
      {
        model: input.model,
        max_tokens: 2048,
        system: input.systemPrompt,
        messages: [{ role: "user", content: fullPrompt }],
      },
      { signal }
    );
    const block = message.content[0];
    content = block.type === "text" ? block.text : "";
  } else {
    // OpenAI, OpenRouter, Google Gemini, and custom providers use an OpenAI-compatible API.
    const extraHeaders: Record<string, string> =
      input.provider === "openrouter"
        ? { "HTTP-Referer": "https://mailwave.app", "X-Title": "Mailwave" }
        : {};
    const client = new OpenAI({
      apiKey: input.apiKey,
      baseURL: input.baseUrl,
      defaultHeaders: extraHeaders,
    });
    const completion = await client.chat.completions.create(
      {
        model: input.model,
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: fullPrompt },
        ],
        max_tokens: 2048,
      },
      { signal }
    );
    content = completion.choices[0]?.message?.content ?? "";
  }

  const cleaned = content.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();

  let parsed: AiGenerationResult;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = {
      subject: "Generated Subject",
      body: content,
      personalizationNotes: "Raw generation - JSON parse failed",
    };
  }

  return parsed;
}

export function buildSystemPrompt(campaignContext: {
  goal?: string | null;
  product?: string | null;
  cta?: string | null;
  tone?: string | null;
  language: string;
  emailLength: string;
  basePrompt?: string | null;
}): string {
  const resolvedBasePrompt =
    campaignContext.basePrompt ??
    "You are an expert cold email copywriter. Write personalized, compelling emails that feel human and are tailored specifically to the recipient.";

  const campaignRequirements = [
    campaignContext.goal ? `- Goal: ${campaignContext.goal}` : null,
    campaignContext.product ? `- Product/Service: ${campaignContext.product}` : null,
    campaignContext.cta ? `- Primary CTA: ${campaignContext.cta}` : null,
    `- Tone: ${campaignContext.tone ?? "professional"}`,
    `- Language: ${campaignContext.language}`,
    `- Email Length: ${campaignContext.emailLength} - ${emailLengthGuide(campaignContext.emailLength)}`,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    resolvedBasePrompt,
    `\nThese campaign requirements MUST be followed exactly - they take priority over any style guidance above:\n${campaignRequirements}`,
    "- Never use generic openers like 'I hope this email finds you well'. Make it specific to the recipient.",
    "- Use the contact's information to make the email feel personally written for them.",
  ]
    .filter(Boolean)
    .join("\n");
}

function emailLengthGuide(length: string): string {
  if (length === "very-short") return "1-3 sentences, extremely brief, under 50 words";
  if (length === "short") return "1-2 paragraphs, very concise";
  if (length === "long") return "5+ paragraphs, detailed";
  return "3-4 paragraphs, balanced";
}

export function buildUserPrompt(contact: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  aiHint?: string | null;
  customFields?: Record<string, string> | null;
}): string {
  const parts = [
    "Write a personalized cold email for the following recipient:",
    `Email: ${contact.email}`,
    contact.firstName || contact.lastName
      ? `Name: ${[contact.firstName, contact.lastName].filter(Boolean).join(" ")}`
      : null,
    contact.company ? `Company: ${contact.company}` : null,
    contact.jobTitle ? `Job Title: ${contact.jobTitle}` : null,
    contact.aiHint ? `Additional context about this person: ${contact.aiHint}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  if (contact.customFields && Object.keys(contact.customFields).length > 0) {
    const fields = Object.entries(contact.customFields)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n");
    return `${parts}\nCustom Fields:\n${fields}`;
  }

  return parts;
}
