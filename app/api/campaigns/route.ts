import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSendQueue } from "@/lib/jobs/queue";
import { z } from "zod";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().min(1),
  listId: z.string().min(1),
  goal: z.string().optional(),
  product: z.string().optional(),
  cta: z.string().optional(),
  tone: z.string().optional(),
  language: z.string().default("en"),
  emailLength: z.string().default("medium"),
  systemPrompt: z.string().default(""),
  intervalType: z.enum(["fixed", "random"]).default("random"),
  minInterval: z.number().int().min(1).default(3),
  maxInterval: z.number().int().min(1).default(8),
  scheduledAt: z.string().optional().refine(
    (v) => !v || !isNaN(Date.parse(v)),
    { message: "Invalid date" }
  ),
  aiProvider: z.enum(["openai", "anthropic", "google_gemini", "openrouter", "custom"]).optional(),
  aiModel: z.string().optional(),
  status: z.enum(["pending"]).default("pending"),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaigns = await prisma.campaign.findMany({
    where: { userId: session.user.id },
    include: {
      list: { select: { id: true, name: true } },
      _count: {
        select: {
          emails: { where: { approvalStatus: "pending" } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const rows = campaigns.map((c) => ({
    ...c,
    approvalPendingCount: c._count.emails,
    _count: undefined,
  }));

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { scheduledAt, aiProvider, intervalType, ...rest } = parsed.data;

  if (scheduledAt) {
    const d = new Date(scheduledAt);
    if (d <= new Date()) {
      return NextResponse.json({ error: "scheduledAt must be in the future" }, { status: 400 });
    }
  }

  // Verify list belongs to user
  const list = await prisma.list.findFirst({
    where: { id: rest.listId, userId: session.user.id },
    include: { _count: { select: { members: true } } },
  });
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });

  const duplicate = await prisma.campaign.findFirst({
    where: { userId: session.user.id, name: rest.name },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json({ error: "A campaign with that name already exists" }, { status: 409 });
  }

  const campaign = await prisma.campaign.create({
    data: {
      ...rest,
      userId: session.user.id,
      intervalType: intervalType as "fixed" | "random",
      ...(scheduledAt ? { scheduledAt: new Date(scheduledAt) } : {}),
      ...(aiProvider ? { aiProvider } : {}),
      totalEmails: list._count.members,
    },
  });

  if (scheduledAt) {
    const delay = new Date(scheduledAt).getTime() - Date.now();
    if (delay > 0) {
      const queue = getSendQueue();
      await queue.add(
        "send",
        { campaignId: campaign.id, userId: session.user.id },
        {
          delay,
          jobId: `scheduled-send-${campaign.id}`,
          attempts: 1,
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        }
      );
    }
  }

  return NextResponse.json(campaign, { status: 201 });
}
