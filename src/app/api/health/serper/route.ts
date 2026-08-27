import { NextResponse } from "next/server";
import { serperFailureReason } from "@/backend/search";
import { cleanKey, shapeHint } from "@/shared/api-key-hygiene";

// Serper self-diagnostic — is real Google data (leads, prospects, market intel)
// live? Reports whether SERPER_API_KEY is present and validates it with one tiny
// read-only search, returning GREEN with a live result count, or the exact error.
// SAFE: a single search query; never returns the key.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // WHAT THE VARIABLE CONTAINS, BEFORE ASKING WHETHER THE KEY IS VALID.
  //
  // This check told an owner "serper.dev REFUSED the key — regenerate it" for a
  // 401. That is right for a revoked key and wrong for a correct key that
  // arrived wrapped in quotes, or with the newline a terminal appended, or
  // pasted as the whole `NAME=value` line. All three produce a 401 from a
  // credential that is not the credential, and all three look identical in a
  // dashboard that renders the value as dots. So the SHAPE is reported first,
  // and the probe now sends the cleaned value.
  const check = cleanKey(process.env.SERPER_API_KEY);
  const key = check.key;
  const hint = shapeHint("serper", key);
  const present = { SERPER_API_KEY: Boolean(key) };
  const keyShape = {
    length: check.length,
    // Never the key. The first and last two characters are enough for an owner
    // to recognise which key they pasted without the value leaving the server.
    looksLike: key ? `${key.slice(0, 2)}…${key.slice(-2)}` : "",
    hadIssues: check.issues,
    cleaned: check.changed,
    notes: check.notes,
    shapeHint: hint,
  };
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

  // A 401 ON A VALUE THAT WAS THE WRONG SHAPE IS NOT A VERDICT ON THE KEY.
  // Naming the paste first is the difference between one fix and an afternoon
  // of regenerating credentials that were never the problem.
  const rejected = p.httpStatus === 401 || p.httpStatus === 403;
  const pasteFirst = rejected && (check.issues.length > 0 || hint)
    ? `RED — serper.dev refused this value (HTTP ${p.httpStatus}), and the value has a problem BEFORE its validity is in question: ${
        check.issues.length ? check.notes[0] : hint
      } Fix the variable and retry before regenerating anything — a correct key pasted wrongly fails exactly like a revoked one.`
    : null;

  const verdict = pasteFirst ?? (!key
    ? "AMBER — no Serper key; real prospect data off (sample data only)."
    : p.ok
      ? "GREEN — real Google/Places data is live."
      : p.quotaExhausted
        ? "AMBER — the key is valid and OUT OF CREDIT. Nothing is misconfigured; top up the Serper plan and discovery resumes immediately."
        : p.unreachable
          ? `RED — the key is present and UNTESTED: this deployment could not reach serper.dev${p.timedOut ? " (timed out)" : ""}. Nothing points at the key. Retry, and check egress from the host.`
          : p.httpStatus === 401 || p.httpStatus === 403
            ? `RED — serper.dev REFUSED the key (HTTP ${p.httpStatus}). This one is the key: regenerate it at serper.dev and set SERPER_API_KEY again.`
            : `RED — serper.dev answered HTTP ${p.httpStatus ?? "?"} and the search did not run. Read \`probe.error\` below: the key is present, so a status that is not 401 or 403 is usually theirs rather than yours.`);
  return NextResponse.json({ service: "serper", verdict, present, keyShape, probe });
}
