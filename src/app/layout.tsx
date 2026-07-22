import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";
import PWARegister from "@/components/PWARegister";

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
        {children}
        <PWARegister />
      </body>
    </html>
  );
}
