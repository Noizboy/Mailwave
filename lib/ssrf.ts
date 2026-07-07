import dns from "node:dns/promises";
import net from "node:net";

/**
 * SSRF protection for user-supplied hostnames (SMTP hosts, AI base URLs, etc.).
 *
 * Rejects hostnames that resolve to private / loopback / link-local / reserved
 * IP ranges, and rejects raw-IP inputs in those ranges directly. This prevents
 * an authenticated user from pointing the server at internal services or
 * cloud-metadata endpoints (CN-005, CWE-918).
 */

const BLOCKED_PREFIXES = [
  "10.",          // 10.0.0.0/8
  "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.", "172.22.", "172.23.",
  "172.24.", "172.25.", "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.", // 172.16.0.0/12
  "192.168.",     // 192.168.0.0/16
  "127.",         // 127.0.0.0/8 loopback
  "169.254.",     // 169.254.0.0/16 link-local (incl. AWS metadata 169.254.169.254)
  "0.",           // 0.0.0.0/8
  "100.64.", "100.65.", "100.66.", "100.67.", "100.68.", "100.69.", "100.70.", "100.71.",
  "100.72.", "100.73.", "100.74.", "100.75.", "100.76.", "100.77.", "100.78.", "100.79.",
  "100.80.", "100.81.", "100.82.", "100.83.", "100.84.", "100.85.", "100.86.", "100.87.",
  "100.88.", "100.89.", "100.90.", "100.91.", "100.92.", "100.93.", "100.94.", "100.95.",
  "100.96.", "100.97.", "100.98.", "100.99.", "100.100.", "100.101.", "100.102.", "100.103.",
  "100.104.", "100.105.", "100.106.", "100.107.", "100.108.", "100.109.", "100.110.", "100.111.",
  "100.112.", "100.113.", "100.114.", "100.115.", "100.116.", "100.117.", "100.118.", "100.119.",
  "100.120.", "100.121.", "100.122.", "100.123.", "100.124.", "100.125.", "100.126.", "100.127.", // 100.64.0.0/10 CGNAT
  "192.0.2.",     // 192.0.2.0/24 TEST-NET-1
  "198.51.100.",  // 198.51.100.0/24 TEST-NET-2
  "203.0.113.",   // 203.0.113.0/24 TEST-NET-3
];

function isBlockedIPv4(ip: string): boolean {
  if (!net.isIPv4(ip)) return false;
  return BLOCKED_PREFIXES.some((p) => ip.startsWith(p));
}

function isBlockedIPv6(ip: string): boolean {
  if (!net.isIPv6(ip)) return false;
  const lower = ip.toLowerCase();
  // ::1 loopback, :: unspecified, fc00::/7 unique-local, fe80::/10 link-local
  return (
    lower === "::1" ||
    lower === "::" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe8") ||
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb")
  );
}

function isBlockedIp(ip: string): boolean {
  return isBlockedIPv4(ip) || isBlockedIPv6(ip);
}

export interface SsrfCheckResult {
  ok: boolean;
  reason?: string;
}

/**
 * Validates a hostname (or host:port, or URL) for outbound server-side use.
 * Resolves all A/AAAA records and rejects if any resolve to a blocked range.
 * Also rejects raw-IP inputs in blocked ranges, and common metadata hostnames.
 */
export async function assertSafeHost(rawHost: string): Promise<SsrfCheckResult> {
  if (!rawHost || typeof rawHost !== "string") {
    return { ok: false, reason: "Host is required." };
  }

  // Accept "host:port" or a full URL; extract the hostname.
  let hostname = rawHost.trim();
  try {
    if (/^https?:\/\//i.test(hostname)) {
      hostname = new URL(hostname).hostname;
    } else if (hostname.includes(":")) {
      // host:port — strip the port. (Bracketed IPv6 [::1]:port handled too.)
      const idx = hostname.lastIndexOf("]");
      if (idx !== -1) {
        hostname = hostname.slice(1, idx);
      } else {
        hostname = hostname.split(":")[0];
      }
    }
  } catch {
    return { ok: false, reason: "Invalid host format." };
  }

  hostname = hostname.toLowerCase();

  // Block obvious metadata / internal hostnames.
  if (hostname === "metadata" || hostname === "metadata.google.internal") {
    return { ok: false, reason: "Internal metadata hostnames are not allowed." };
  }

  // Raw IP input — check directly without DNS lookup.
  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      return { ok: false, reason: "Host resolves to a private/reserved IP range." };
    }
    return { ok: true };
  }

  // Hostname — resolve and check every resolved address.
  let addresses: string[];
  try {
    const result = await dns.lookup(hostname, { all: true, verbatim: true });
    addresses = result.map((a) => a.address);
  } catch {
    return { ok: false, reason: "Could not resolve hostname." };
  }
  if (addresses.length === 0) {
    return { ok: false, reason: "Hostname did not resolve to any address." };
  }
  for (const ip of addresses) {
    if (isBlockedIp(ip)) {
      return { ok: false, reason: "Host resolves to a private/reserved IP range." };
    }
  }
  return { ok: true };
}
