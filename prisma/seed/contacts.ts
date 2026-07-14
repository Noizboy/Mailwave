import type { PrismaClient } from "../../app/generated/prisma/client";
import type { ContactSeed } from "./types";
import { resolveContactStatus } from "./shared";
import { CONTACT_SEEDS } from "./fixtures";

// Contact persistence. Each contact is upserted against the (userId, email)
// unique key so re-running the seed updates existing rows in place and keeps
// the demo scenario stable.

export type SeededContact = {
  contact: Awaited<ReturnType<PrismaClient["contact"]["upsert"]>>;
  listIds: string[];
};

export async function seedContacts(prisma: PrismaClient, userId: string) {
  const seededContacts: SeededContact[] = [];

  for (const contactSeed of CONTACT_SEEDS) {
    const status = resolveContactStatus(contactSeed);
    const contactData = {
      email: contactSeed.email,
      firstName: contactSeed.firstName,
      lastName: contactSeed.lastName,
      company: contactSeed.company,
      jobTitle: contactSeed.jobTitle,
      aiHint: contactSeed.aiHint,
      status,
    };

    const contact = await prisma.contact.upsert({
      where: { userId_email: { userId, email: contactSeed.email } },
      update: contactData,
      create: {
        userId,
        ...contactData,
      },
    });

    seededContacts.push({
      contact,
      listIds: contactSeed.listIds ?? [],
    });
  }

  return seededContacts;
}

export async function addMembersToList(prisma: PrismaClient, listId: string, contactIds: string[]) {
  for (const contactId of contactIds) {
    await prisma.listMember.upsert({
      where: { listId_contactId: { listId, contactId } },
      update: {},
      create: { listId, contactId },
    });
  }
}
