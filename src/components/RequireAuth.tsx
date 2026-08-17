"use client";

// Dashboard auth guard — closes the "enter without signing up" loopholes.
//
// When Firebase Auth is configured (production), a signed-OUT visitor is
// redirected to /login before the OS renders — no matter which link they
// followed. When Firebase is NOT configured (zero-config demo, e.g. the owner's
// keyless test env), there are no accounts to enforce, so the demo stays open —
// preserving the platform's zero-config rule. The moment the Firebase web key is
// set, sign-up/login is required everywhere.

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { firebaseAuth, firebaseConfigured } from "@/frontend/firebase-client";
import AppSplash from "@/components/AppSplash";

export default function RequireAuth({ children }: { children: ReactNode }) {
  const router = useRouter();
  // Demo (no Firebase) → allowed immediately. Production → wait for auth state.
  const [status, setStatus] = useState<"checking" | "allowed">(firebaseConfigured && firebaseAuth ? "checking" : "allowed");

  useEffect(() => {
    if (!firebaseConfigured || !firebaseAuth) return; // demo: nothing to enforce
    let unsub: (() => void) | undefined;
    (async () => {
      const { onAuthStateChanged } = await import("firebase/auth");
      unsub = onAuthStateChanged(firebaseAuth!, (user) => {
        if (user) setStatus("allowed");
        else router.replace("/login?next=/dashboard");
      });
    })();
    return () => { if (unsub) unsub(); };
  }, [router]);

  if (status === "checking") {
    // The launch screen, not a bare spinner. This frame is the hand-over from
    // the operating system's splash, and until now it changed the colour of the
    // screen twice on the way into an app that had not finished opening.
    return <AppSplash label="Opening MarketWar OS" />;
  }
  return <>{children}</>;
}
