"use client";

// The lead form on a PUBLIC hosted landing page. Submits to /api/landing/lead
// (public, rate-limited) which writes the lead into the brand's Customer Vault.
// Pure client component — no auth, works for any visitor.

import { useState } from "react";

type FormField = { key: string; label: string; type: string; required: boolean };

export default function LandingLeadForm({
  brandId, slug, fields, submitLabel, accent,
}: {
  brandId: string;
  slug: string;
  fields: FormField[];
  submitLabel: string;
  accent: string;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy"); setMessage("");
    try {
      const res = await fetch("/api/landing/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, slug, fields: values }),
      });
      const data = await res.json();
      if (!res.ok) { setState("error"); setMessage(data?.error || "Something went wrong — please try again."); return; }
      setState("done"); setMessage(data?.message || "Thanks — we'll be in touch shortly.");
    } catch {
      setState("error"); setMessage("Network error — please try again.");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-xl border p-6 text-center" style={{ borderColor: `${accent}55`, background: `${accent}12` }}>
        <p className="text-lg font-bold" style={{ color: accent }}>✓ {message}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {fields.map((f) => (
        <div key={f.key}>
          <label className="mb-1 block text-sm font-medium text-slate-600">{f.label}{f.required ? " *" : ""}</label>
          <input
            type={f.type === "tel" ? "tel" : f.type === "email" ? "email" : "text"}
            required={f.required}
            value={values[f.key] || ""}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-slate-500"
          />
        </div>
      ))}
      <button
        type="submit"
        disabled={state === "busy"}
        className="w-full rounded-lg px-4 py-3 text-base font-bold text-white transition disabled:opacity-60"
        style={{ background: accent }}
      >
        {state === "busy" ? "Sending…" : submitLabel}
      </button>
      {state === "error" && <p className="text-sm text-red-600">{message}</p>}
      <p className="text-center text-xs text-slate-400">Your details are handled securely. No spam.</p>
    </form>
  );
}
