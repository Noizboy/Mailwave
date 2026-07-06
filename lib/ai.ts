import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export type AiProviderName = "openai" | "anthropic" | "google_gemini" | "openrouter" | "custom";

export interface AiGenerationInput {
  provider: AiProviderName;
  model: string;
  apiKey: string;
  baseUrl?: string;
  systemPrompt: string;
  userPrompt: string;
}

export interface AiGenerationResult {
  subject: string;
  body: string;
  personalizationNotes: string;
}

export async function generateEmail(input: AiGenerationInput): Promise<AiGenerationResult> {
  const fullPrompt = `${input.userPrompt}

Respond with ONLY a JSON object in this exact format (no markdown, no code fences):
{
  "subject": "The email subject line",
  "body": "The full email body in plain text. Use \\n for newlines.",
  "personalizationNotes": "Brief note on how this email was personalized for this contact"
}`;

  let content: string;

  if (input.provider === "anthropic") {
    const client = new Anthropic({ apiKey: input.apiKey });
    const message = await client.messages.create({
      model: input.model,
      max_tokens: 2048,
      system: input.systemPrompt,
      messages: [{ role: "user", content: fullPrompt }],
    });
    const block = message.content[0];
    content = block.type === "text" ? block.text : "";
  } else {
    // OpenAI, OpenRouter, Google Gemini, custom — all use OpenAI-compatible API
    const extraHeaders: Record<string, string> =
      input.provider === "openrouter"
        ? { "HTTP-Referer": "https://mailwave.app", "X-Title": "Mailwave" }
        : {};
    const client = new OpenAI({
      apiKey: input.apiKey,
      baseURL: input.baseUrl,
      defaultHeaders: extraHeaders,
    });
    const completion = await client.chat.completions.create({
      model: input.model,
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: fullPrompt },
      ],
      max_tokens: 2048,
    });
    content = completion.choices[0]?.message?.content ?? "";
  }

  // Strip markdown fences if model ignored instructions
  const cleaned = content.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();

  let parsed: AiGenerationResult;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Fallback: extract what we can from raw text
    parsed = {
      subject: "Generated Subject",
      body: content,
      personalizationNotes: "Raw generation — JSON parse failed",
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
  extraInstructions?: string | null;
  basePrompt?: string | null;
  senderName?: string | null;
  senderGender?: string | null;
}): string {
  const genderNote =
    campaignContext.senderGender === "male"
      ? "The sender is male — use masculine voice and masculine gendered endings (e.g. -o in Spanish: 'estoy listo', 'soy el encargado')."
      : campaignContext.senderGender === "female"
      ? "The sender is female — use feminine voice and feminine gendered endings (e.g. -a in Spanish: 'estoy lista', 'soy la encargada')."
      : null;

  const footerNote = campaignContext.senderName
    ? `Email signature: ${campaignContext.senderName} — always close the email with this name as the signature.`
    : null;

  const parts = [
    campaignContext.basePrompt ?? "You are an expert cold email copywriter. Write personalized, compelling emails that feel human and are tailored specifically to the recipient.",
    campaignContext.goal ? `Campaign Goal: ${campaignContext.goal}` : null,
    campaignContext.product ? `Product/Service: ${campaignContext.product}` : null,
    campaignContext.cta ? `Primary CTA: ${campaignContext.cta}` : null,
    `Tone: ${campaignContext.tone ?? "professional"}`,
    `Language: ${campaignContext.language}`,
    `Email Length: ${campaignContext.emailLength} — ${emailLengthGuide(campaignContext.emailLength)}`,
    genderNote,
    footerNote,
    campaignContext.extraInstructions ? `Additional Instructions: ${campaignContext.extraInstructions}` : null,
    "Never use generic openers like 'I hope this email finds you well'. Make it specific to the recipient.",
    "Use the contact's information to make the email feel personally written for them.",
  ]
    .filter(Boolean)
    .join("\n");

  return parts;
}

function emailLengthGuide(length: string): string {
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
