import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";
import PWARegister from "@/components/PWARegister";
import SiteJsonLd from "@/components/SiteJsonLd";
import CookieConsent from "@/components/CookieConsent";
import { splashLinks } from "@/shared/pwa-splash";

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
      <head>
        {/* iOS LAUNCH IMAGES.
            Android needs nothing here — Chrome builds its splash from the
            manifest's name, background colour and 512px icon, all of which are
            already declared. iOS ignores the manifest for this entirely and
            uses these, matched on device geometry AND pixel ratio AND
            orientation; with no match it opens the app on a white rectangle.
            The list and the files both come from src/shared/pwa-splash.ts, so a
            link can never point at an image that was never generated. */}
        {splashLinks().map((l) => (
          <link key={l.href + l.media} rel={l.rel} media={l.media} href={l.href} />
        ))}
      </head>
      <body className="font-body">
        <SiteJsonLd />
        {children}
        <PWARegister />
        {/* Google Tag Manager used to load here, unconditionally, for every
            visitor on every route. GTM exists to set and read cookies that are
            not necessary for the site to work, and PECR requires consent BEFORE
            that — so the container now lives behind the consent gate and loads
            only on an explicit grant. Rejecting is exactly as easy as accepting,
            and doing neither leaves it off. */}
        <CookieConsent />
      </body>
    </html>
  );
}
