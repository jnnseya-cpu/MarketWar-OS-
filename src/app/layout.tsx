import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Archivo, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import PWARegister from "@/components/PWARegister";
import SiteJsonLd from "@/components/SiteJsonLd";
import CookieConsent from "@/components/CookieConsent";
import ReferralCapture from "@/components/ReferralCapture";
import AnalyticsRouteTracker from "@/components/AnalyticsRouteTracker";
import { splashLinks } from "@/shared/pwa-splash";

// SPACE GROTESK AND INTER ARE OUT, and that is not a matter of taste.
//
// They are the two faces that appear on almost every generated interface, so a
// reader who has seen a few recognises the pairing before they have read a word
// — which is exactly the impression this platform cannot afford while it is
// asking a business to trust it with an ad budget.
//
// ARCHIVO for display. A grotesque with a real width axis, drawn for signage
// and tabular work: it holds a tight headline without the geometric roundness
// that makes Space Grotesk instantly placeable, and the extra width at large
// sizes gives the page a built, engineered feel rather than a typed one.
//
// INSTRUMENT SANS for text. Crisp, slightly condensed, with a lower x-height
// than Inter and more distinct letterforms, so long UI copy reads as written
// rather than defaulted.
//
// JETBRAINS MONO for every figure. Money, counts, percentages and identifiers
// are set in it and made tabular in globals.css, because a column of numbers
// that does not line up is the fastest way for a serious tool to look unfinished.
const display = Archivo({
  subsets: ["latin"],
  variable: "--font-display",
  // Variable weight AND width: `axes` may only be used when the weight is left
  // variable, so the width axis is opened here and driven from CSS.
  axes: ["wdth"],
});

const body = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-body",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "700"],
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
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <head>
        {/* THE THEME, BEFORE THE FIRST PAINT.
            Reading the stored choice in React means the first frame is always
            the default, so a light-theme user sees a black flash on every
            navigation. This runs synchronously in the head, before the body
            exists, so the document is already stamped when it is painted.
            Deliberately tiny and dependency-free — anything in here blocks the
            page. Wrapped in try/catch because localStorage throws outright in
            some privacy modes, and a theme preference must never be able to
            stop a page rendering. Dark is the default: the app has always been
            dark and this identity is dark-first, so light is opt-in rather than
            something that flips under people who never asked. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('mw-theme')==='light')document.documentElement.setAttribute('data-theme','light')}catch(e){}`,
          }}
        />
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
        {/* Reports client-side navigations, which neither tag can see. It is a
            no-op without consent, so mounting it here changes nothing for a
            visitor who said no. */}
        <Suspense fallback={null}>
          <AnalyticsRouteTracker />
        </Suspense>
        {/* Stores who sent this visitor, but only once they have accepted
            cookies — affiliate attribution is not a necessary cookie. Without
            consent it stores nothing and the creator is still credited for the
            visit, because the code rides in the URL. */}
        <Suspense fallback={null}>
          <ReferralCapture />
        </Suspense>
      </body>
    </html>
  );
}
