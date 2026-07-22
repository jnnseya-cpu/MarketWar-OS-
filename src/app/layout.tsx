import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";
import PWARegister from "@/components/PWARegister";

// Google Tag Manager container. Overridable per-environment via NEXT_PUBLIC_GTM_ID
// (set it empty to disable, e.g. in a staging build); defaults to the live container.
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID ?? "GTM-MFF3H6F8";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://marketwaros.com"),
  title: "MarketWar OS — AI Customer Acquisition Operating System",
  description:
    "Stop guessing. Launch, test, kill, improve, and convert automatically. MarketWar OS diagnoses your business, rebuilds your offer, runs campaigns, protects your budget and tells you exactly what to do next.",
  applicationName: "MarketWar OS",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/brand/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/brand/icon-180.png",
  },
  appleWebApp: { capable: true, title: "MarketWar OS", statusBarStyle: "black-translucent" },
};

// Responsive on every screen (viewport-fit=cover handles notches/safe areas).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#070a11",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="font-body">
        {/* Google Tag Manager (noscript) — immediately after <body> */}
        {GTM_ID ? (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        ) : null}
        {children}
        <PWARegister />
        {/* Google Tag Manager — loads on every route (App Router root layout) */}
        {GTM_ID ? (
          <Script id="gtm-base" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`}
          </Script>
        ) : null}
      </body>
    </html>
  );
}
