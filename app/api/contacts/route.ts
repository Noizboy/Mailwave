import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api/session";
import { listContacts } from "@/lib/contacts/list-contacts";
import { createContact } from "@/lib/contacts/create-contact";
import { z } from "zod";

export const runtime = "nodejs";

const createSchema = z.object({
  email: z.email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  aiHint: z.string().optional(),
  customFields: z.record(z.string(), z.string()).optional(),
  listId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);

  const result = await listContacts(user.id, {
    search: searchParams.get("search") || "",
    status: searchParams.get("status") || "",
    listId: searchParams.get("listId") || "",
    fromDate: searchParams.get("fromDate") || "",
    toDate: searchParams.get("toDate") || "",
    page: parseInt(searchParams.get("page") || "1"),
    limit: parseInt(searchParams.get("limit") || "50"),
  });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const result = await createContact(user.id, parsed.data);

  if (result.ok) {
    return NextResponse.json(result.contact, { status: 201 });
  }
  return NextResponse.json({ error: result.error }, { status: result.status });
}
