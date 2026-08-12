import { NextRequest, NextResponse } from "next/server";
import { deriveCampaignMetrics } from "@/lib/campaign-metrics";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api/session";
import { findOwnedList } from "@/lib/api/ownership";
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
  dailyLimit: z.number().int().min(1).default(100),
  hourlyLimit: z.number().int().min(1).default(20),
  sendWindowStart: z.number().int().min(0).max(23).nullable().optional(),
  sendWindowEnd: z.number().int().min(0).max(23).nullable().optional(),
  aiProvider: z.enum(["openai", "anthropic", "google_gemini", "openrouter", "custom"]).optional(),
  aiModel: z.string().optional(),
  status: z.enum(["pending"]).default("pending"),
});

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaigns = await prisma.campaign.findMany({
    where: { userId: user.id },
    include: {
      list: { select: { id: true, name: true } },
      emails: {
        select: {
          approvalStatus: true,
          status: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const rows = campaigns.map(({ emails, ...campaign }) => ({
    ...campaign,
    ...deriveCampaignMetrics(emails),
  }));

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const { aiProvider, intervalType, ...rest } = parsed.data;

  // Verify list belongs to the authenticated user before counting its members.
  const list = await findOwnedList(rest.listId, user.id, {
    include: { _count: { select: { members: true } } },
  });
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });

  const duplicate = await prisma.campaign.findFirst({
    where: { userId: user.id, name: rest.name },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json({ error: "A campaign with that name already exists" }, { status: 409 });
  }

  const campaign = await prisma.campaign.create({
    data: {
      ...rest,
      userId: user.id,
      intervalType: intervalType as "fixed" | "random",
      ...(aiProvider ? { aiProvider } : {}),
      totalEmails: list._count.members,
    },
  });

  return NextResponse.json(campaign, { status: 201 });
}
