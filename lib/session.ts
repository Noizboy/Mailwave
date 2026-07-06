import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user as { id: string; email: string; name?: string | null };
}
