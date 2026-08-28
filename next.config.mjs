/** @type {import('next').NextConfig} */

// Transport-security posture (docs/ai-os/08 §B.4a: TLS 1.3 mandatory, HSTS
// so browsers can never downgrade; clickjacking/MIME/referrer hardening).
// Content-Security-Policy: self by default; inline styles/scripts allowed for
// Next's hydration; images/fonts from self + data/blob; XHR/fetch to self + any
// HTTPS (Firebase, Stripe, AI providers via the server, analytics). A nonce-based
// script-src is the hardening follow-up. clickjacking closed via frame-ancestors.
// Google Tag Manager / Analytics hosts — allowed so the site's own analytics
// actually loads (previously the CSP blocked gtm.js on every page).
const GA = "https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com";
// Firebase Storage / Google user-content hosts — so hosted images AND rendered
// video actually DISPLAY inline (previously blocked by default-src, so a hosted
// MP4/image only opened via a direct link, not in the on-page player).
const MEDIA = "https://firebasestorage.googleapis.com https://storage.googleapis.com https://*.googleusercontent.com";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://www.googletagmanager.com`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${GA} ${MEDIA}`,
  "font-src 'self' data:",
  `media-src 'self' blob: data: ${MEDIA}`,
  `connect-src 'self' https: ${GA}`,
  "frame-src 'self' https://www.googletagmanager.com https://www.youtube.com https://www.youtube-nocookie.com",
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
  // camera=(self), NOT camera=().
  //
  // An empty allowlist denies the feature to EVERY origin — including this one.
  // So the Screen & Presentation Recorder's camera and microphone were refused
  // by the browser before any permission dialog could appear, and getUserMedia
  // rejected with NotAllowedError no matter what the person set in Edge or in
  // Windows. Every word of help this platform printed about padlock icons and
  // privacy settings was advice about a cause that did not exist: the site was
  // blocking itself, and had been since the header was written.
  //
  // `self` is the narrow form — this origin only, still denied to every iframe
  // and third party. geolocation stays fully off: nothing here asks for it.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Content-Security-Policy", value: csp },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig = {
  reactStrictMode: true,
  // firebase-admin (and its native/gRPC deps: gRPC, protobufjs, farmhash) must
  // NOT be bundled by Next's server compiler. Bundling builds green but then
  // fails to load at runtime cold-start on Vercel's serverless runtime — every
  // route that imports firebase-admin 500s with a bare "Internal Server Error".
  // Marking it external makes Next load it as a normal node_module at runtime,
  // which is how the Admin SDK is designed to be consumed. Graduated out of
  // `experimental` in Next 15 — same behaviour, top-level key.
  serverExternalPackages: ["firebase-admin"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
