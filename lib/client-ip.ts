// Resolves the trusted client IP from proxy headers (CN-004).
//
// SECURITY: `X-Forwarded-For` is a client-appendable header. Behind a reverse
// proxy (Traefik in this deployment), the proxy APPENDS the real peer address
// to the RIGHT of any value the client sent, so the right-most entries are the
// trustworthy ones. Naive code that reads the LEFT-most entry lets a client
// spoof its IP (`X-Forwarded-For: 1.2.3.4, <realip>`) and evade per-IP
// brute-force / rate limiting. We index from the right instead.
//
// TRUSTED_PROXY_COUNT is the number of reverse proxies in front of the app
// (default 1 for the single-Traefik deployment). We skip that many entries
// from the right and use the next one as the real client address.

export function getClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      const proxies = Math.max(1, parseInt(process.env.TRUSTED_PROXY_COUNT ?? "1", 10) || 1);
      const idx = parts.length - proxies;
      return parts[idx >= 0 ? idx : 0];
    }
  }
  return headers.get("x-real-ip") ?? "unknown";
}
