import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deriveCampaignMetrics } from "@/lib/campaign-metrics";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const campaign = await prisma.campaign.findFirst({
    where: { id, userId: session.user.id },
    include: {
      list: { select: { id: true, name: true } },
      emails: {
        select: {
          id: true,
          contactId: true,
          subject: true,
          approvalStatus: true,
          status: true,
          sentAt: true,
          contact: { select: { email: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const metrics = deriveCampaignMetrics(campaign.emails);
  return NextResponse.json({
    ...campaign,
    sentCount: metrics.sentCount,
    failedCount: metrics.failedCount,
    skippedCount: metrics.skippedCount,
    pendingCount: metrics.pendingCount,
  });
}

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  listId: z.string().min(1).optional(),
  // Only allow statuses a user can set manually; sending/completed/failed/generating
  // are owned by the worker and must never be set directly via the API.
  status: z.enum(["pending", "pending_review", "ready_to_send", "paused"]).optional(),
  goal: z.string().optional(),
  product: z.string().optional(),
  cta: z.string().optional(),
  tone: z.string().optional(),
  language: z.string().optional(),
  emailLength: z.string().optional(),
  systemPrompt: z.string().optional(),
  intervalType: z.enum(["fixed", "random"]).optional(),
  minInterval: z.number().int().min(1).optional(),
  maxInterval: z.number().int().min(1).optional(),
  aiProvider: z.enum(["openai", "anthropic", "google_gemini", "openrouter", "custom"]).nullable().optional(),
  aiModel: z.string().nullable().optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { scheduledAt, ...rest } = parsed.data;

  if (rest.name) {
    const duplicate = await prisma.campaign.findFirst({
      where: { userId: session.user.id, name: rest.name, NOT: { id } },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json({ error: "A campaign with that name already exists" }, { status: 409 });
    }
  }

  const updated = await prisma.campaign.updateMany({
    where: { id, userId: session.user.id },
    data: {
      ...rest,
      ...(scheduledAt !== undefined ? { scheduledAt: scheduledAt ? new Date(scheduledAt) : null } : {}),
    },
  });

  if (updated.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  await prisma.campaign.deleteMany({
    where: { id, userId: session.user.id },
  });

  return NextResponse.json({ ok: true });
}
