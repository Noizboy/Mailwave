import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyEmailId } from "@/lib/track-sign";
import { isBlocked, markBlock, checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

// Record at most one open event per email every 10 minutes. Additional pixel
// loads (preview-pane re-renders, forwards, etc.) are ignored within the window.
const OPEN_BLOCK_MS = 10 * 60 * 1000;

// SEC-005: cap pixel hits at 60/min/IP to stop metric inflation and ID
// scraping. The pixel is ALWAYS returned — only the `opened` event is silenced.
const TRACK_IP_MAX = 60;
const TRACK_IP_WINDOW_MS = 60 * 1000;

function pixelResponse(): NextResponse {
  return new NextResponse(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

function clientIp(req: NextRequest): string {
  // Trusted proxy provides X-Forwarded-For. Fall back to a stable "unknown"
  // so all un-proxied traffic shares a single bucket (dev/test only).
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ emailId: string }> }) {
  const { emailId } = await params;
  const signature = req.nextUrl.searchParams.get("s");

  // Always return the pixel — never reveal whether the signature was valid.
  // Reject unsigned or tampered requests silently (CN-002).
  if (!verifyEmailId(emailId, signature)) {
    return pixelResponse();
  }

  // SEC-005: per-IP rate limit. When exceeded, still return the pixel but
  // skip recording the `opened` event so email clients keep rendering.

  // Rate-limit per emailId: a single open is recorded per 10-minute window.
  // Additional pixel loads (e.g. from preview panes re-rendering) are ignored
  // and do NOT consume the IP quota — only fresh opens do.
  const key = `track:${emailId}`;
  if ((await isBlocked(key)).blocked) {
    return pixelResponse();
  }

  // This request would record an open — charge it to the IP quota.
  const ipRl = await checkRateLimit(`track:${clientIp(req)}`, TRACK_IP_MAX, TRACK_IP_WINDOW_MS);
  if (!ipRl.allowed) {
    // Silently drop the open event but keep serving the pixel.
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
      // Ignore further opens for this email for 10 minutes.
      await markBlock(key, OPEN_BLOCK_MS);
    }
  } catch {
    // Never fail — always return the pixel
  }

  return pixelResponse();
}
