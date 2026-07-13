import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyEmailId } from "@/lib/track-sign";
import { isBlocked, markBlockPermanent, checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

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

// Known email provider image proxies and security scanners that prefetch images
// before the user opens the email. Requests from these must not count as opens.
// Apple Mail Privacy Protection cannot be detected this way (it spoofs a normal
// Safari User-Agent), so it is not listed here — the sentAt time check below
// catches that case.
const EMAIL_PROXY_UA = [
  "GoogleImageProxy",
  "YahooMailProxy",
  "Microsoft-Office",        // Office 365 SafeLinks / Attachment scanning
  "msfetch",                 // Older Microsoft mail proxies
  "Proofpoint",              // Proofpoint email security scanner
  "Barracuda",               // Barracuda Sentinel
  "Mimecast",                // Mimecast email security
  "proton-go-http-client",   // ProtonMail proxy
];

function isKnownEmailProxy(req: NextRequest): boolean {
  const ua = req.headers.get("user-agent") ?? "";
  return EMAIL_PROXY_UA.some((proxy) => ua.includes(proxy));
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

  // Known email proxy prefetch — Gmail and Yahoo fetch images before the user
  // opens the email. Never count these as real opens.
  if (isKnownEmailProxy(req)) {
    return pixelResponse();
  }

  // One open event per email, ever. Additional pixel loads are ignored and do
  // NOT consume the IP quota — only fresh opens do.
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
      select: { id: true, status: true, sentAt: true },
    });
    if (email?.status === "sent") {
      // Ignore opens that arrive within 5 seconds of sentAt. SMTP-level security
      // scanners and some mail proxies (including Apple MPP on fast connections)
      // fetch tracking pixels the moment an email is accepted by the server,
      // producing false opens. Legitimate human opens require the email to be
      // delivered, a notification to appear, and the user to tap/click — that
      // takes at minimum several seconds after sentAt.
      if (email.sentAt && Date.now() - email.sentAt.getTime() < 15_000) {
        return pixelResponse();
      }
      await prisma.deliveryEvent.create({
        data: { campaignEmailId: emailId, eventType: "opened" },
      });
      await markBlockPermanent(key);
    }
  } catch {
    // Never fail — always return the pixel
  }

  return pixelResponse();
}
