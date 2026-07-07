import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { validatePassword } from "@/lib/password-policy";

export const runtime = "nodejs";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { currentPassword, newPassword } = parsed.data;

  // Reject same-as-current — a common policy requirement and also prevents
  // the breach-list check from flagging the (valid) current password.
  if (currentPassword === newPassword) {
    return NextResponse.json({ error: "New password must be different from the current one." }, { status: 400 });
  }

  // Full policy: length + local denylist + HIBP breach-list check (CN-011).
  const policy = await validatePassword(newPassword);
  if (!policy.ok) {
    return NextResponse.json({ error: policy.reason ?? "Password is not strong enough." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });

  const newHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash: newHash },
  });

  const response: { ok: true; warning?: string } = { ok: true };
  if (policy.breachCheckSkipped) {
    response.warning = "Breached-password database was unreachable. Your password was set, but please consider changing it again later to verify it hasn't been leaked.";
  }
  return NextResponse.json(response);
}
