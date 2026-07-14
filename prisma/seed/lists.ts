import type { PrismaClient } from "../../app/generated/prisma/client";
import { LIST_SEEDS } from "./fixtures";

// List persistence. List ids are stable so campaigns and memberships can
// reference them deterministically across repeated seed runs.

export type SeededLists = Record<(typeof LIST_SEEDS)[number]["id"], Awaited<ReturnType<PrismaClient["list"]["upsert"]>>>;

export async function seedLists(prisma: PrismaClient, userId: string) {
  const lists = {} as SeededLists;

  for (const listSeed of LIST_SEEDS) {
    lists[listSeed.id] = await prisma.list.upsert({
      where: { id: listSeed.id },
      update: { name: listSeed.name },
      create: {
        id: listSeed.id,
        userId,
        name: listSeed.name,
      },
    });
  }

  return lists;
}
