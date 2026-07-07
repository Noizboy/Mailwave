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
  password: z.string().min(8),
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
        const key = `login:${ip}`;

        const { blocked, retryAfterSeconds } = isBlocked(key);
        if (blocked) throw new RateLimitError(`Try again in ${retryAfterSeconds}s`);

        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          recordFailure(key);
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });
        if (!user) {
          recordFailure(key);
          return null;
        }

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) {
          recordFailure(key);
          return null;
        }

        resetFailures(key);
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
