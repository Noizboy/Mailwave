// Shared types and pure helpers for the campaign detail surface.

export interface ContactSnippet {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  jobTitle: string | null;
  status: string | null;
}

export interface EmailRow {
  id: string;
  subject: string | null;
  body: string | null;
  personalizationNotes: string | null;
  approvalStatus: string;
  status: string;
  sentAt: string | null;
  opened?: boolean;
  contact: ContactSnippet;
}

export interface CampaignEmail {
  status: string;
  sentAt: string | null;
}

export interface CampaignDetail {
  id: string;
  name: string;
  status: string;
  totalEmails: number;
  sentCount: number;
  failedCount: number;
  pendingCount: number;
  skippedCount: number;
  list: { id: string; name: string };
  goal: string | null;
  product: string | null;
  cta: string | null;
  tone: string | null;
  language: string | null;
  emailLength: string | null;
  systemPrompt: string | null;
  aiProvider: string | null;
  aiModel: string | null;
  intervalType: string;
  minInterval: number;
  maxInterval: number;
  startedAt: string | null;
  nextSendAt: string | null;
  updatedAt: string;
  createdAt: string;
  scheduledAt: string | null;
  emails: CampaignEmail[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const AVATAR_COLORS = [
  "bg-blue-600",
  "bg-emerald-600",
  "bg-orange-500",
  "bg-violet-600",
  "bg-teal-600",
  "bg-rose-500",
  "bg-amber-600",
  "bg-cyan-600",
  "bg-indigo-600",
  "bg-pink-600",
] as const;

export const TONE_LABELS: Record<string, string> = {
  professional: "Professional",
  friendly: "Friendly",
  "friendly & direct": "Friendly & direct",
  casual: "Casual",
  formal: "Formal",
  persuasive: "Persuasive",
};

export const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  es: "Spanish",
  pt: "Portuguese",
  fr: "French",
  de: "German",
};

export const EMAIL_LENGTH_LABELS: Record<string, string> = {
  "very-short": "Very Short (under 50 words)",
  short: "Short (60–100 words)",
  medium: "Medium (100–200 words)",
  long: "Long (200–350 words)",
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function getAvatarColor(name: string): string {
  const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function getContactInitials(contact: ContactSnippet): string {
  if (contact.firstName && contact.lastName) {
    return (contact.firstName[0] + contact.lastName[0]).toUpperCase();
  }
  if (contact.firstName) return contact.firstName.slice(0, 2).toUpperCase();
  return contact.email.slice(0, 2).toUpperCase();
}

export function getContactName(contact: ContactSnippet): string {
  return (
    [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
    contact.email
  );
}

export function formatCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.ceil(msRemaining / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0)
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

export function getNextEmailLabel(
  campaign: CampaignDetail,
  nowMs: number
): string | null {
  if (campaign.status !== "sending") return null;
  const processed =
    campaign.sentCount + campaign.failedCount + campaign.skippedCount;
  if (processed >= campaign.totalEmails) return null;
  if (campaign.nextSendAt) {
    const remainingMs = new Date(campaign.nextSendAt).getTime() - nowMs;
    return remainingMs > 0
      ? `Next email in ${formatCountdown(remainingMs)}`
      : "Sending now";
  }

  const sentEmails = campaign.emails.filter(
    (e) => e.status === "sent" && e.sentAt
  );
  const fallbackTargetMs = sentEmails.length
    ? Math.max(
        ...sentEmails.map((e) => new Date(e.sentAt!).getTime())
      ) +
      campaign.minInterval * 60 * 1000
    : Math.max(
        ...[campaign.startedAt, campaign.updatedAt]
          .filter((value): value is string => Boolean(value))
          .map((value) => new Date(value).getTime())
      );
  if (!Number.isFinite(fallbackTargetMs)) return null;
  return fallbackTargetMs > nowMs
    ? `Next email in ${formatCountdown(fallbackTargetMs - nowMs)}`
    : "Sending now";
}
