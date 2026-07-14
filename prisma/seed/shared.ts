import { PrismaClient } from "../../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { ContactSeed, ContactStatus } from "./types";

// Shared time constants used by the fixture/persistence builders so the demo
// scenario offsets stay consistent across modules.
export const DAY = 24 * 60 * 60 * 1000;
export const HOUR = 60 * 60 * 1000;

export function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for seeding");
  }
  return databaseUrl;
}

export function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: getDatabaseUrl() });
  return new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function resolveContactStatus(contact: ContactSeed): ContactStatus {
  return contact.status ?? (isValidEmail(contact.email) ? "subscribed" : "invalid");
}

export function fillTemplate(template: string, values: { firstName?: string | null; company?: string | null }) {
  return template
    .replaceAll("{firstName}", values.firstName || "there")
    .replaceAll("{company}", values.company || "your company");
}
