import { z } from "zod";

export interface CampaignForWizard {
  id: string;
  name: string;
  listId: string;
  goal?: string | null;
  product?: string | null;
  cta?: string | null;
  tone?: string | null;
  language?: string | null;
  emailLength?: string | null;
  systemPrompt?: string | null;
  intervalType: string;
  minInterval: number;
  maxInterval: number;
  scheduledAt?: string | null;
  aiProvider?: string | null;
  aiModel?: string | null;
}

export const wizardSchema = z.object({
  name: z.string().min(1, "Campaign name is required"),
  listId: z.string().min(1, "Please select a list"),
  goal: z.string().optional(),
  product: z.string().optional(),
  cta: z.string().optional(),
  tone: z.string().optional(),
  language: z.string(),
  emailLength: z.string(),
  systemPrompt: z.string().optional(),
  intervalType: z.enum(["fixed", "random"]),
  minInterval: z.number().int().min(1),
  maxInterval: z.number().int().min(1),
  scheduledAt: z.string().optional(),
  aiProvider: z.enum(["openai", "anthropic", "google_gemini", "openrouter", "custom", ""]).optional(),
  aiModel: z.string().optional(),
});

export type WizardData = z.infer<typeof wizardSchema>;

export interface ListOption {
  id: string;
  name: string;
  totalContacts: number;
  subscribedContacts: number;
}

export const STEPS = [
  { id: 1, label: "Details" },
  { id: 2, label: "Instructions" },
  { id: 3, label: "Sending" },
  { id: 4, label: "Review" },
];

export const stepFields: Record<number, Array<keyof WizardData>> = {
  1: ["name", "listId"],
  2: ["goal", "product", "cta", "tone", "language", "emailLength", "systemPrompt"],
  3: ["intervalType", "minInterval", "maxInterval", "scheduledAt"],
};

export async function fetchLists(): Promise<ListOption[]> {
  const res = await fetch("/api/lists");
  if (!res.ok) throw new Error("Failed");
  return res.json();
}
