import { prisma } from "@/lib/prisma";
import { findOwnedList } from "@/lib/api/ownership";

/**
 * Create a contact for a user, optionally adding it to a list.
 *
 * MT-M2: extracted from the contacts POST route so the route is a thin HTTP
 * adapter. The route handles auth + zod validation and maps the result; this
 * function owns list-ownership verification, duplicate detection, contact
 * creation (with lowercased email and `subscribed` status), and optional
 * list-membership creation.
 *
 * Returns a discriminated union so the route keeps full control of the HTTP
 * status and body.
 */

export interface CreateContactInput {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  jobTitle?: string;
  aiHint?: string;
  customFields?: Record<string, string>;
  listId?: string;
}

export type CreateContactResult =
  | { ok: true; contact: unknown }
  | { ok: false; status: 404; error: string }
  | { ok: false; status: 409; error: string };

export async function createContact(
  userId: string,
  input: CreateContactInput
): Promise<CreateContactResult> {
  const { listId, ...contactData } = input;

  // If a listId is supplied, verify it belongs to this user before creating a
  // membership — otherwise a caller could add a contact to another user's list.
  if (listId) {
    const owned = await findOwnedList(listId, userId, { select: { id: true } });
    if (!owned) return { ok: false, status: 404, error: "List not found" };
  }

  const existing = await prisma.contact.findFirst({
    where: { userId, email: contactData.email.toLowerCase() },
  });
  if (existing) {
    return {
      ok: false,
      status: 409,
      error: "Contact with this email already exists",
    };
  }

  const { customFields, ...restContactData } = contactData;
  const contact = await prisma.contact.create({
    data: {
      ...restContactData,
      email: contactData.email.toLowerCase(),
      userId,
      status: "subscribed",
      ...(customFields ? { customFields } : {}),
    },
  });

  if (listId) {
    await prisma.listMember.create({
      data: { listId, contactId: (contact as { id: string }).id },
    });
  }

  return { ok: true, contact };
}
