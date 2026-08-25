import type { NextConfig } from "next";
import path from "path";

// No external scripts/styles/fonts/images are loaded anywhere in this app —
// fonts are self-hosted via next/font, and every fetch is same-origin. So
// this stays locked to 'self' rather than allow-listing hosts nothing uses.
// script-src/style-src keep 'unsafe-inline' because Next.js's own hydration
// bootstrap and Tailwind's injected <style> tags need it without a
// per-request nonce wired through src/proxy.ts (a further hardening step,
// not required for the confirmed scope here).
// 'unsafe-eval' is dev-only: Next/React's dev-mode tooling (HMR, Turbopack,
// stack-trace reconstruction) calls eval(); production never does.
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy", value: CSP },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  // HSTS only makes sense once the site is actually served over HTTPS.
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    root: path.join(__dirname),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
