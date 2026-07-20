/** @type {import('next').NextConfig} */

// Transport-security posture (docs/ai-os/08 §B.4a: TLS 1.3 mandatory, HSTS
// so browsers can never downgrade; clickjacking/MIME/referrer hardening).
// Content-Security-Policy: self by default; inline styles/scripts allowed for
// Next's hydration; images/fonts from self + data/blob; XHR/fetch to self + any
// HTTPS (Firebase, Stripe, AI providers via the server, analytics). A nonce-based
// script-src is the hardening follow-up. clickjacking closed via frame-ancestors.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Content-Security-Policy", value: csp },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
