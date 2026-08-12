import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, name: true, email: true, timezone: true, createdAt: true },
  });

  return NextResponse.json(account);
}

const VALID_TIMEZONES = new Set(Intl.supportedValuesOf("timeZone"));

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  timezone: z.string().refine((tz) => VALID_TIMEZONES.has(tz), {
    message: "Invalid timezone",
  }).optional(),
});

export async function PATCH(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: parsed.data,
    select: { id: true, name: true, email: true, timezone: true },
  });

  return NextResponse.json(updated);
}
