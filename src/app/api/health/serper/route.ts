import { NextResponse } from "next/server";

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
        probe = { ran: true, ok: false, httpStatus: res.status, error: body, fix: res.status === 403 || res.status === 401 ? "Key rejected — check it's correct and has credit at serper.dev → Dashboard." : "Serper returned an error — see the status/body above." };
      }
    } catch (e) { probe = { ran: true, ok: false, error: (e as Error).message, fix: "Server couldn't reach serper.dev — a network/egress issue on the host." }; }
  }
  const verdict = !key ? "AMBER — no Serper key; real prospect data off (sample data only)."
    : (probe as { ok?: boolean }).ok ? "GREEN — real Google/Places data is live."
    : "RED — Serper key present but rejected (see fix).";
  return NextResponse.json({ service: "serper", verdict, present, probe });
}
