import { prisma } from "@/lib/prisma";
import {
  generateEmail,
  buildSystemPrompt,
  buildUserPrompt,
  resolveAiConfig,
} from "@/lib/ai";
import {
  APIConnectionError,
  AuthenticationError,
  NotFoundError,
  RateLimitError,
  PermissionDeniedError,
  BadRequestError,
  APIError,
} from "openai";

/**
 * Test the user's AI configuration by making a single provider call and
 * persisting the resulting connection status.
 *
 * MT-M2: extracted from the settings/ai/test route so the route is a thin
 * HTTP adapter. The route handles auth + rate limiting and maps the result;
 * this function owns config lookup, resolution, the test generation call,
 * status persistence, and provider-error translation.
 *
 * Behavior preserved from the original route:
 * - No stored config → 422, no status update.
 * - resolveAiConfig failure → 422, no status update (early return).
 * - generateEmail failure → 422 after persisting `status: "error"`.
 * - Success → 200 after persisting `status: "connected"`.
 */

export type AiTestResult =
  | { ok: true }
  | { ok: false; status: 422; error: string };

export async function testAiConnection(userId: string): Promise<AiTestResult> {
  const config = await prisma.aiConfig.findUnique({ where: { userId } });

  if (!config) {
    return { ok: false, status: 422, error: "AI not configured" };
  }

  let success = false;
  let errorMessage = "An unexpected error occurred.";

  try {
    // Resolve + validate the AI config through the shared boundary (MT-H4):
    // decrypts the key, resolves model/base URL, and validates custom base
    // URLs (SSRF / DNS-rebinding — CN-005) so the test endpoint never makes
    // an outbound call to an unsafe host.
    const resolved = await resolveAiConfig(config);
    if (!resolved.ok) {
      errorMessage =
        resolved.error.code === "unsafe-base-url"
          ? resolved.error.message
          : "AI not configured";
      return { ok: false, status: 422, error: errorMessage };
    }

    const { provider, model, apiKey, baseUrl } = resolved.config;

    await generateEmail({
      provider,
      model,
      apiKey,
      baseUrl,
      systemPrompt: buildSystemPrompt({
        goal: "Test connection",
        tone: "professional",
        language: "en",
        emailLength: "short",
      }),
      userPrompt: buildUserPrompt({ email: "test@example.com" }),
    });

    success = true;
  } catch (err) {
    console.error(
      "[AI test] provider=%s error=%s status=%s msg=%s",
      config.provider,
      err instanceof Error ? err.constructor.name : typeof err,
      (err as { status?: number }).status ?? "n/a",
      err instanceof Error ? err.message : String(err),
    );
    errorMessage = friendlyAiError(err);
  }

  await prisma.aiConfig.update({
    where: { userId },
    data: {
      status: success ? "connected" : "error",
      testedAt: new Date(),
    },
  });

  if (success) return { ok: true };
  return { ok: false, status: 422, error: errorMessage };
}

/**
 * Translate an OpenAI/Anthropic SDK error into a user-facing message.
 *
 * Both SDKs share class names but are separate imports, so constructor-name
 * matching covers the Anthropic variants without a second import.
 */
function friendlyAiError(err: unknown): string {
  if (err instanceof APIConnectionError) {
    return "Could not reach the provider. Check the Base URL and your network connection.";
  }
  if (err instanceof AuthenticationError) {
    return "Invalid API key. Check your credentials and try again.";
  }
  if (err instanceof PermissionDeniedError) {
    return "Access denied. Your API key may not have permission to use this model.";
  }
  if (err instanceof NotFoundError) {
    return "Model not found. Check the model name is correct for this provider.";
  }
  if (err instanceof RateLimitError) {
    return "Rate limit reached. Wait a moment and try again.";
  }
  if (err instanceof BadRequestError) {
    return "Bad request. For OpenRouter, use the format 'provider/model' (e.g. openai/gpt-4o-mini).";
  }
  // Anthropic SDK errors share the same class names but are separate imports —
  // check by constructor name to avoid a second import.
  if (err instanceof Error) {
    const name = err.constructor.name;
    if (name === "APIConnectionError") {
      return "Could not reach the provider. Check the Base URL and your network connection.";
    }
    if (name === "AuthenticationError") {
      return "Invalid API key. Check your credentials and try again.";
    }
    if (name === "PermissionDeniedError") {
      return "Access denied. Your API key may not have permission to use this model.";
    }
    if (name === "NotFoundError") {
      return "Model not found. Check the model name is correct for this provider.";
    }
    if (name === "RateLimitError") {
      return "Rate limit reached. Wait a moment and try again.";
    }
    if (name === "BadRequestError") {
      return "Bad request. For OpenRouter, use the format 'provider/model' (e.g. openai/gpt-4o-mini).";
    }
    if (name === "UnprocessableEntityError") {
      return "The provider rejected the model or request. Check the model name is valid for this provider.";
    }
    // Fallback: if the error has a status code, surface it directly
    const status = (err as { status?: number }).status;
    if (typeof status === "number") {
      if (status === 402) return "Insufficient credits on your provider account. Add credits and try again.";
      console.error("[AI test] API error status=%s name=%s msg=%s", status, name, err.message);
      return `Provider error (${status}): ${err.message}`;
    }
    console.error("[AI test] Unrecognized error:", name, err.message);
  }
  // Catch-all for any remaining OpenAI SDK API errors (e.g. 402 payment required)
  if (err instanceof APIError) {
    if (err.status === 402) {
      return "Insufficient credits on your provider account. Add credits and try again.";
    }
    console.error("[AI test] APIError status=%s message=%s", err.status, err.message);
    return `Provider error (${err.status}): ${err.message}`;
  }
  return "An unexpected error occurred. Check your provider settings and try again.";
}
