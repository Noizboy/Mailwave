import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { isBlocked, recordFailure, resetFailures } from "@/lib/rate-limit";

class RateLimitError extends CredentialsSignin {
  code = "rate_limit";
}

const loginSchema = z.object({
  email: z.email(),
  // Login accepts any non-empty password — the strength policy (CN-011) is
  // enforced at password-change time, not at login, so users with older
  // weaker passwords can still authenticate and then upgrade.
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        const ip =
          (req as Request).headers.get("x-forwarded-for")?.split(",")[0].trim() ??
          (req as Request).headers.get("x-real-ip") ??
          "unknown";

        const parsed0 = loginSchema.safeParse(credentials);
        // Composite key: defeats both IP rotation (still blocked per-account)
        // and single-IP credential stuffing across many accounts (CN-004).
        const emailKey = parsed0.success ? parsed0.data.email.toLowerCase() : "unknown";
        const ipKey = `login:ip:${ip}`;
        const accountKey = `login:acct:${emailKey}`;

        const ipBlock = await isBlocked(ipKey);
        const acctBlock = await isBlocked(accountKey);
        if (ipBlock.blocked) throw new RateLimitError(`Try again in ${ipBlock.retryAfterSeconds}s`);
        if (acctBlock.blocked) throw new RateLimitError(`Try again in ${acctBlock.retryAfterSeconds}s`);

        const parsed = parsed0;
        if (!parsed.success) {
          await recordFailure(ipKey);
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });
        if (!user) {
          await recordFailure(ipKey);
          await recordFailure(accountKey);
          return null;
        }

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) {
          await recordFailure(ipKey);
          await recordFailure(accountKey);
          return null;
        }

        await resetFailures(ipKey);
        await resetFailures(accountKey);
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      return session;
    },
  },
});
