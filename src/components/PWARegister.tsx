"use client";

// Registers the service worker so MarketWar OS is installable as a PWA and
// tolerates flaky connections. No-op where service workers aren't supported.
import { useEffect } from "react";

export default function PWARegister() {
  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const onLoad = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
      if (document.readyState === "complete") onLoad();
      else window.addEventListener("load", onLoad, { once: true });
    }
  }, []);
  return null;
}
