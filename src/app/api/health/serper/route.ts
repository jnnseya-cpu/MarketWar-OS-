import { NextResponse } from "next/server";
import { serperFailureReason } from "@/backend/search";

// Serper self-diagnostic — is real Google data (leads, prospects, market intel)
// live? Reports whether SERPER_API_KEY is present and validates it with one tiny
// read-only search, returning GREEN with a live result count, or the exact error.
// SAFE: a single search query; never returns the key.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const key = process.env.SERPER_API_KEY || "";
  const present = { SERPER_API_KEY: Boolean(key) };
  let probe: Record<string, unknown> = { ran: false, note: "No SERPER_API_KEY — lead/prospect engines return clearly-labelled sample data until it's set." };
  if (key) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12_000);
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST", signal: ctrl.signal,
        headers: { "X-API-KEY": key, "Content-Type": "application/json" },
        body: JSON.stringify({ q: "test", gl: "uk" }),
      });
      clearTimeout(t);
      if (res.ok) {
        const d = (await res.json().catch(() => ({}))) as { organic?: unknown[]; places?: unknown[] };
        probe = { ran: true, ok: true, organicResults: Array.isArray(d.organic) ? d.organic.length : 0, note: "Serper key valid — real Google/Places data will power the lead + prospect engines." };
      } else {
        const body = (await res.text().catch(() => "")).slice(0, 160);
        // A 429/402 means the key is FINE and the balance is not. Reporting that
        // as "key rejected" sends the owner hunting for a vanished environment
        // variable instead of topping up, which is the actual fix.
        probe = { ran: true, ok: false, httpStatus: res.status, error: body, quotaExhausted: res.status === 429 || res.status === 402, fix: serperFailureReason(res.status) };
      }
    } catch (e) {
      // NOT REACHING A SERVICE IS NOT THE SAME AS BEING REFUSED BY IT.
      // Marked so the verdict below cannot call this a rejected key.
      const aborted = (e as Error).name === "AbortError";
      probe = {
        ran: true, ok: false, unreachable: true, timedOut: aborted,
        error: aborted ? "The request to serper.dev timed out after 12s." : (e as Error).message,
        fix: "This deployment could not reach serper.dev. The key is not implicated — check egress from the host, or try again: a single slow response looks identical to an outage.",
      };
    }
  }
  // THE VERDICT MUST NAME WHAT ACTUALLY HAPPENED.
  //
  // Reported by the owner: "Real prospect data (Serper) is red but the key is
  // present." Both true. Every non-ok probe that was not a quota error fell to
  // one sentence — "key present but REJECTED" — which is a specific accusation
  // against the key, and it was printed for a network failure, a timeout, and
  // any HTTP status at all. An owner reading it goes looking for a bad or
  // vanished key, which is the one thing that had already been ruled out by the
  // word "present" in the same sentence.
  //
  // Four outcomes, four sentences, each with a different next move.
  const p = probe as { ok?: boolean; quotaExhausted?: boolean; unreachable?: boolean; timedOut?: boolean; httpStatus?: number };
  const verdict = !key
    ? "AMBER — no Serper key; real prospect data off (sample data only)."
    : p.ok
      ? "GREEN — real Google/Places data is live."
      : p.quotaExhausted
        ? "AMBER — the key is valid and OUT OF CREDIT. Nothing is misconfigured; top up the Serper plan and discovery resumes immediately."
        : p.unreachable
          ? `RED — the key is present and UNTESTED: this deployment could not reach serper.dev${p.timedOut ? " (timed out)" : ""}. Nothing points at the key. Retry, and check egress from the host.`
          : p.httpStatus === 401 || p.httpStatus === 403
            ? `RED — serper.dev REFUSED the key (HTTP ${p.httpStatus}). This one is the key: regenerate it at serper.dev and set SERPER_API_KEY again.`
            : `RED — serper.dev answered HTTP ${p.httpStatus ?? "?"} and the search did not run. Read \`probe.error\` below: the key is present, so a status that is not 401 or 403 is usually theirs rather than yours.`;
  return NextResponse.json({ service: "serper", verdict, present, probe });
}
