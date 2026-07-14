import { auth } from "@/lib/auth";

/**
 * The authenticated principal derived from the NextAuth session. This is the
 * only user identity API route handlers should trust; it carries the `id`
 * used for tenant isolation.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string | null;
}

/**
 * Loads the authenticated user from the NextAuth session, or `null` when
 * there is no session.
 *
 * This is a direct helper: it returns data, not a `Response`. Route handlers
 * decide the HTTP status to emit (typically 401) when the result is `null`,
 * so each route keeps full control of its status codes and bodies.
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user as AuthenticatedUser;
}
