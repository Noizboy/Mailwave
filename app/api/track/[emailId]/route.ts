import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyEmailId } from "@/lib/track-sign";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";

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
  // Use the proxy-appended (right-most) X-Forwarded-For entry so a client can't
  // spoof its IP to evade the per-IP quota or forge Apple-MPP/scanner IPs.
  return getClientIp(req.headers);
}

// Security scanner UAs that prefetch images at delivery time, before any user
// action. These are hard-blocked because their fetches always arrive too early
// to be useful and would create false open events. Events from unknown scanners
// or email-client proxies (GoogleImageProxy, YahooMailProxy) pass through and
// are filtered at query time in the emails API using the sentAt → occurredAt
// delta (CN-002). Email-client proxies fetch when the user opens — not at
// delivery — so the 15 s threshold correctly distinguishes them from scanners.
const EMAIL_PROXY_UA = [
  "Microsoft-Office",        // Office 365 SafeLinks / Attachment scanning
  "msfetch",                 // Older Microsoft mail proxies
  "Proofpoint",              // Proofpoint email security scanner
  "Barracuda",               // Barracuda Sentinel
  "Mimecast",                // Mimecast email security
  "proton-go-http-client",   // ProtonMail proxy
  "IronPort",                // Cisco IronPort / Cisco Email Security
  "Sophos",                  // Sophos email gateway
  "Forcepoint",              // Forcepoint email security
  "Abnormal",                // Abnormal Security
  "AppRiver",                // AppRiver email security
  "Cloudflare-Email",        // Cloudflare Email Security scanner
];

// Apple Mail Privacy Protection (iOS 15+, macOS 12+) prefetches ALL images
// through Apple relay servers before the user opens the email. Apple owns the
// entire 17.0.0.0/8 block and uses it exclusively for this proxy — blocking
// this subnet prevents false opens from Apple Mail users (CN-003).
const APPLE_MPP_OCTET = 17;

function isAppleMppIp(ip: string): boolean {
  return parseInt(ip.split(".")[0], 10) === APPLE_MPP_OCTET;
}

function isKnownEmailProxy(ua: string, ip: string): boolean {
  if (EMAIL_PROXY_UA.some((proxy) => ua.includes(proxy))) return true;
  if (isAppleMppIp(ip)) return true;
  return false;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ emailId: string }> }) {
  const { emailId } = await params;
  const signature = req.nextUrl.searchParams.get("s");

  // Always return the pixel — never reveal whether the signature was valid.
  // Reject unsigned or tampered requests silently (CN-002).
  if (!verifyEmailId(emailId, signature)) {
    return pixelResponse();
  }

  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") ?? "";

  // Known proxy prefetch — drop before touching the DB or consuming IP quota.
  if (isKnownEmailProxy(ua, ip)) {
    return pixelResponse();
  }

  // SEC-005: per-IP rate limit to stop bulk scraping / metric inflation.
  const ipRl = await checkRateLimit(`track:${ip}`, TRACK_IP_MAX, TRACK_IP_WINDOW_MS);
  if (!ipRl.allowed) {
    return pixelResponse();
  }

  // CN-003: per-(emailId, IP) dedup — one event per IP per email per 60 s.
  // Prevents multi-node proxy deployments (e.g. Proofpoint Enterprise, Mimecast
  // cluster) from registering multiple events when they scan from different IPs.
  const emailIpRl = await checkRateLimit(`track:email:${emailId}:${ip}`, 1, 60_000);
  if (!emailIpRl.allowed) {
    return pixelResponse();
  }

  try {
    const email = await prisma.campaignEmail.findUnique({
      where: { id: emailId },
      select: { id: true, status: true },
    });
    if (email?.status === "sent") {
      await prisma.deliveryEvent.create({
        data: {
          campaignEmailId: emailId,
          eventType: "opened",
          metadata: { ip, ua: ua || null },
        },
      });
    }
  } catch {
    // Never fail — always return the pixel
  }

  return pixelResponse();
}
