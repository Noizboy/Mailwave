import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Ownership loaders for the primary tenant-scoped resources.
 *
 * Each loader enforces the `userId` tenant filter on a single-resource
 * lookup and returns the raw Prisma result. Callers pass any additional
 * `select` / `include` / `omit` arguments and keep full control of the HTTP
 * response (typically 404) when the result is `null`.
 *
 * These are direct helpers: they return data, not a `Response`, and never
 * hide the status-code decision inside the helper.
 */

type CampaignFindFirstArgs = Prisma.CampaignFindFirstArgs;
type ContactFindFirstArgs = Prisma.ContactFindFirstArgs;
type ListFindFirstArgs = Prisma.ListFindFirstArgs;

/** Loads a single campaign scoped to `userId`. Returns `null` when not owned. */
export async function findOwnedCampaign<T extends CampaignFindFirstArgs>(
  id: string,
  userId: string,
  args?: Prisma.SelectSubset<T, CampaignFindFirstArgs>
) {
  return prisma.campaign.findFirst<T>({
    ...((args ?? {}) as CampaignFindFirstArgs),
    where: { id, userId },
  } as Prisma.SelectSubset<T, CampaignFindFirstArgs>);
}

/** Loads a single contact scoped to `userId`. Returns `null` when not owned. */
export async function findOwnedContact<T extends ContactFindFirstArgs>(
  id: string,
  userId: string,
  args?: Prisma.SelectSubset<T, ContactFindFirstArgs>
) {
  return prisma.contact.findFirst<T>({
    ...((args ?? {}) as ContactFindFirstArgs),
    where: { id, userId },
  } as Prisma.SelectSubset<T, ContactFindFirstArgs>);
}

/** Loads a single list scoped to `userId`. Returns `null` when not owned. */
export async function findOwnedList<T extends ListFindFirstArgs>(
  id: string,
  userId: string,
  args?: Prisma.SelectSubset<T, ListFindFirstArgs>
) {
  return prisma.list.findFirst<T>({
    ...((args ?? {}) as ListFindFirstArgs),
    where: { id, userId },
  } as Prisma.SelectSubset<T, ListFindFirstArgs>);
}
