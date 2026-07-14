import { prisma } from "@/lib/prisma";

/**
 * List a user's contacts with filtering, pagination, and the sending-account
 * suppression threshold.
 *
 * MT-M2: extracted from the contacts GET route so the route is a thin HTTP
 * adapter. The route parses search params and maps the response; this
 * function owns the Prisma `where` construction, pagination clamping, the
 * parallel find/count/sending-account lookup, and response shaping.
 */

export interface ContactListFilters {
  search: string;
  status: string;
  listId: string;
  fromDate: string;
  toDate: string;
  page: number;
  limit: number;
}

export interface ContactListResult {
  contacts: unknown[];
  total: number;
  page: number;
  limit: number;
  suppressAfterEmails: number;
}

/** Maximum number of contacts returned per page. */
const MAX_PAGE_SIZE = 100;
/** Default page size when none is requested. */
const DEFAULT_PAGE_SIZE = 50;

export async function listContacts(
  userId: string,
  filters: ContactListFilters
): Promise<ContactListResult> {
  const page = Math.max(1, filters.page);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.limit || DEFAULT_PAGE_SIZE));
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { userId };
  if (filters.status) where.status = filters.status;
  if (filters.search) {
    where.OR = [
      { email: { contains: filters.search, mode: "insensitive" } },
      { firstName: { contains: filters.search, mode: "insensitive" } },
      { lastName: { contains: filters.search, mode: "insensitive" } },
      { company: { contains: filters.search, mode: "insensitive" } },
    ];
  }
  if (filters.listId) {
    where.listMembers = { some: { listId: filters.listId } };
  }
  if (filters.fromDate || filters.toDate) {
    const sentAtFilter: Record<string, Date> = {};
    if (filters.fromDate) sentAtFilter.gte = new Date(filters.fromDate);
    if (filters.toDate) sentAtFilter.lte = new Date(filters.toDate + "T23:59:59.999Z");
    where.campaignEmails = { some: { sentAt: sentAtFilter } };
  }

  const [contacts, total, sendingAccount] = await Promise.all([
    prisma.contact.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        company: true,
        jobTitle: true,
        status: true,
        emailsSentCount: true,
        createdAt: true,
        listMembers: { include: { list: { select: { id: true, name: true } } } },
        campaignEmails: {
          where: { sentAt: { not: null } },
          orderBy: { sentAt: "desc" },
          take: 1,
          include: { campaign: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.contact.count({ where }),
    prisma.sendingAccount.findUnique({
      where: { userId },
      select: { suppressAfterEmails: true },
    }),
  ]);

  return {
    contacts,
    total,
    page,
    limit,
    suppressAfterEmails: sendingAccount?.suppressAfterEmails ?? 3,
  };
}
