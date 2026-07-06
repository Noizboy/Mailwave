import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSuppressContactsQueue } from "@/lib/jobs/queue";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  const [smtp, sending] = await Promise.all([
    prisma.smtpConfig.findUnique({
      where: { userId },
      select: { dailyLimit: true, hourlyLimit: true },
    }),
    prisma.sendingAccount.findUnique({
      where: { userId },
      select: { suppressAfterEmails: true },
    }),
  ]);

  return NextResponse.json({
    dailyLimit: smtp?.dailyLimit ?? 500,
    hourlyLimit: smtp?.hourlyLimit ?? 50,
    suppressAfterEmails: sending?.suppressAfterEmails ?? 3,
  });
}

const schema = z.object({
  dailyLimit: z.number().int().min(1).max(100000).optional(),
  hourlyLimit: z.number().int().min(1).max(10000).optional(),
  suppressAfterEmails: z.number().int().min(1).max(1000).optional(),
});

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { dailyLimit, hourlyLimit, suppressAfterEmails } = parsed.data;

  await Promise.all([
    (dailyLimit !== undefined || hourlyLimit !== undefined)
      ? prisma.smtpConfig.upsert({
          where: { userId },
          create: {
            userId,
            ...(dailyLimit !== undefined ? { dailyLimit } : {}),
            ...(hourlyLimit !== undefined ? { hourlyLimit } : {}),
          },
          update: {
            ...(dailyLimit !== undefined ? { dailyLimit } : {}),
            ...(hourlyLimit !== undefined ? { hourlyLimit } : {}),
          },
        })
      : Promise.resolve(),
    suppressAfterEmails !== undefined
      ? prisma.sendingAccount.upsert({
          where: { userId },
          create: { userId, suppressAfterEmails },
          update: { suppressAfterEmails },
        })
      : Promise.resolve(),
  ]);

  // Enqueue a background job to suppress contacts that now exceed the new threshold.
  // jobId is fixed per user so duplicate saves don't queue more than one pending job.
  if (suppressAfterEmails !== undefined) {
    const queue = getSuppressContactsQueue();
    await queue.add(
      "apply-suppress-threshold",
      { userId, suppressAfterEmails },
      { jobId: `suppress-${userId}`, removeOnComplete: true, removeOnFail: 100 }
    );
  }

  return NextResponse.json({ ok: true });
}
