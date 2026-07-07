import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const securityHeaders = [
  // HTTPS-only once deployed. HSTS is intentionally dev-skipped so local
  // http://localhost doesn't get pinned.
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
        ]
    : []),
  // Clickjacking — CSP frame-ancestors 'none' is the modern equivalent, but
  // X-Frame-Options is kept for legacy browsers.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  // CSP: restrict everything to same-origin by default. Next.js needs
  // 'unsafe-inline' for styles in dev (HMR/style-loader) and for some
  // Radix UI inline styles in prod; scripts are locked to 'self' + the
  // Next.js inline runtime. No external CDNs are used by the app.
  // The tracking pixel is same-origin, so img-src 'self' covers it.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle for the Docker image (no node_modules
  // copy needed at runtime).
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  // Suppress the X-Powered-By header to avoid advertising the framework/version.
  poweredByHeader: false,
};

export default nextConfig;
