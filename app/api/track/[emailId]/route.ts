import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyEmailId } from "@/lib/track-sign";
import { isBlocked, recordFailure } from "@/lib/rate-limit";

export const runtime = "nodejs";

const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

function pixelResponse(): NextResponse {
  return new NextResponse(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ emailId: string }> }) {
  const { emailId } = await params;
  const signature = req.nextUrl.searchParams.get("s");

  // Always return the pixel — never reveal whether the signature was valid.
  // Reject unsigned or tampered requests silently (CN-002).
  if (!verifyEmailId(emailId, signature)) {
    return pixelResponse();
  }

  // Rate-limit per emailId: a single open is recorded per 10-minute window.
  // Additional pixel loads (e.g. from preview panes re-rendering) are ignored.
  const key = `track:${emailId}`;
  if (isBlocked(key).blocked) {
    return pixelResponse();
  }

  try {
    const email = await prisma.campaignEmail.findUnique({
      where: { id: emailId },
      select: { id: true, status: true },
    });
    if (email?.status === "sent") {
      await prisma.deliveryEvent.create({
        data: { campaignEmailId: emailId, eventType: "opened" },
      });
      // Block further open events for this email for 10 minutes.
      recordFailure(key);
    }
  } catch {
    // Never fail — always return the pixel
  }

  return pixelResponse();
}
