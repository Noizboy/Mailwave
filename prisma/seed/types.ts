// Shared seed type contracts. Kept separate from fixtures and persistence so
// builders can depend on the shapes without pulling in data or Prisma details.

export type ContactStatus = "subscribed" | "unsubscribed" | "suppressed" | "invalid";

export type ContactSeed = {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  jobTitle?: string;
  aiHint?: string;
  status?: ContactStatus;
  listIds?: string[];
};

export type CampaignSeed = {
  id: string;
  name: string;
  listId: string;
  goal: string;
  product: string;
  cta: string;
  tone: string;
  language: string;
  emailLength: string;
  systemPrompt: string;
  status: "pending" | "pending_review" | "ready_to_send" | "sending" | "completed";
  minInterval: number;
  maxInterval: number;
  dailyLimit: number;
  hourlyLimit: number;
  totalEmails?: number;
  sentCount?: number;
  failedCount?: number;
  pendingCount?: number;
  startedAt?: Date;
  completedAt?: Date;
};

export type CampaignEmailSeed = {
  subject: string;
  body: string;
  status: "pending" | "sent";
  approvalStatus: "pending" | "approved";
  generatedAt: Date | null;
  sentAt: Date | null;
  personalizationNotes?: string;
};
