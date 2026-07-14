import type { PrismaClient } from "../../app/generated/prisma/client";
import bcrypt from "bcryptjs";

// Seeds the demo user (and its sending account). The user is the ownership
// root for every other seeded record, so this must run first.

export async function seedDemoUser(prisma: PrismaClient, passwordHash: string) {
  const user = await prisma.user.upsert({
    where: { email: "demo@mailwave.app" },
    update: {
      passwordHash,
      name: "Demo User",
      sendingAccount: {
        upsert: {
          update: { suppressAfterEmails: 3 },
          create: { suppressAfterEmails: 3 },
        },
      },
    },
    create: {
      email: "demo@mailwave.app",
      passwordHash,
      name: "Demo User",
      sendingAccount: {
        create: {
          suppressAfterEmails: 3,
        },
      },
    },
  });

  return user;
}

export async function hashSeedPassword() {
  const demoPassword = process.env.SEED_DEMO_PASSWORD ?? "password123";
  if (!process.env.SEED_DEMO_PASSWORD) {
    console.warn("⚠  SEED_DEMO_PASSWORD not set - using default 'password123' (dev/test only).");
  }
  const passwordHash = await bcrypt.hash(demoPassword, 12);
  return { passwordHash, demoPassword };
}
