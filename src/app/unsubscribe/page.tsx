"use client";

// LEAVING, MADE EASY ON PURPOSE.
//
// This page asks for nothing. No login, no "are you sure", no survey, no
// "manage your preferences" maze with eleven checkboxes. One click, done,
// confirmed in plain words.
//
// That is not politeness, it is self-interest with a long memory: the reason
// people press "spam" instead of "unsubscribe" is almost always that
// unsubscribe did not work last time. MarketWar's whole product leaves through
// one sending domain, so a complaint rate earned by our own newsletter is
// charged to every customer's campaign mail. The cheapest possible insurance
// against that is an unsubscribe that works first time.
//
// It also runs OUTSIDE the dashboard, so the human gate and the sign-in wall
// never stand between somebody and the door.

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, TriangleAlert } from "lucide-react";

export default function UnsubscribePage() {
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("");

  const leave = useCallback(async (token: string) => {
    try {
      const res = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json()) as { error?: string; note?: string };
      if (!res.ok) { setState("error"); setMessage(data.error || "That link did not work."); return; }
      setState("done");
      setMessage(data.note || "You are unsubscribed.");
    } catch {
      setState("error");
      setMessage("We could not reach the server. Try the link again in a moment — and if it fails twice, reply to any of our emails and we will remove you by hand.");
    }
  }, []);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("t") || "";
    if (!token) { setState("error"); setMessage("That link is missing its code. Use the unsubscribe link from the email itself."); return; }
    void leave(token);
  }, [leave]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-950 px-5">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-ink-900 p-7 text-center">
        {state === "working" && (
          <>
            <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-slate-500" />
            <p className="text-sm text-slate-400">Removing you from the list…</p>
          </>
        )}

        {state === "done" && (
          <>
            <Check className="mx-auto mb-3 h-7 w-7 text-emerald-400" />
            <h1 className="font-display text-lg font-bold text-white">You are unsubscribed</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{message}</p>
            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              Your account is untouched — this only stops the weekly email. Anything you asked us to send you,
              like a password reset or a receipt, still arrives.
            </p>
          </>
        )}

        {state === "error" && (
          <>
            <TriangleAlert className="mx-auto mb-3 h-7 w-7 text-amber-400" />
            <h1 className="font-display text-lg font-bold text-white">That link did not work</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{message}</p>
            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              You should not have to fight to leave a mailing list. Reply to any email from us with the word
              &ldquo;unsubscribe&rdquo; and a person will take you off it.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
