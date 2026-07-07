import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ emailId: string }> }) {
  const { emailId } = await params;

  try {
    const email = await prisma.campaignEmail.findUnique({ where: { id: emailId } });
    if (email?.status === "sent") {
      await prisma.deliveryEvent.create({
        data: { campaignEmailId: emailId, eventType: "opened" },
      });
    }
  } catch {
    // Never fail — always return the pixel
  }

  return new NextResponse(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
