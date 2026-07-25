import { NextResponse } from "next/server";
import { probeStorage } from "@/backend/storage";

// Storage self-diagnostic — green/red readout for Firebase Storage, so
// "video won't host" stops being a guess. Reports which storage-related env
// vars are present (booleans only, never values) and ACTUALLY writes + reads a
// tiny probe object, surfacing Google's exact error + a targeted fix if it fails.
//
// SAFE: writes one small text file to health/storage-probe.txt (overwritten each
// run) and reads it back. No secrets are ever returned.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const present = {
    FIREBASE_STORAGE_BUCKET: Boolean(process.env.FIREBASE_STORAGE_BUCKET),
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: Boolean(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
    FIREBASE_PROJECT_ID: Boolean(process.env.FIREBASE_PROJECT_ID),
    FIREBASE_CLIENT_EMAIL: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
    FIREBASE_PRIVATE_KEY: Boolean(process.env.FIREBASE_PRIVATE_KEY),
  };

  const probe = await probeStorage();

  const verdict = !probe.configured
    ? "RED — Storage not configured (see fix)."
    : probe.ok
      ? (probe.readable ? "GREEN — write + public read both work. Rendered video will host and attach." : "AMBER — upload works but the public URL wasn't readable back (this host may block the read; it usually works from the browser). Check bucket public-read / download-token rules.")
      : "RED — upload failed (see error + fix).";

  return NextResponse.json({ service: "firebase-storage", verdict, present, probe });
}
