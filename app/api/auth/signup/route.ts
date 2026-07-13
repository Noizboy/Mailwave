import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { validatePassword } from "@/lib/password-policy";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";

export const runtime = "nodejs";

const signupSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.email(),
  // Upper bound prevents bcrypt DoS on absurdly long inputs; minimum length
  // is enforced by validatePassword (12 chars per NIST SP 800-63B).
  password: z.string().min(1).max(128),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);

  const rl = await checkRateLimit(`signup:ip:${ip}`, 10, 15 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Too many signup attempts. Try again in ${rl.retryAfterSeconds}s.` },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { name, email, password } = parsed.data;

  const policy = await validatePassword(password);
  if (!policy.ok) {
    return NextResponse.json(
      { error: policy.reason ?? "Password does not meet requirements." },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Email already registered." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      sendingAccount: { create: { suppressAfterEmails: 3 } },
    },
  });

  const response: { ok: true; warning?: string } = { ok: true };
  if (policy.breachCheckSkipped) {
    response.warning =
      "Breach-password database was unreachable. Your account was created, but consider changing your password later to verify it hasn't been leaked.";
  }
  return NextResponse.json(response, { status: 201 });
}
