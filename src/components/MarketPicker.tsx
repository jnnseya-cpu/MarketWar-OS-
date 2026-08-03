"use client";

import { useMemo, useState } from "react";
import { Globe2, Plus, X } from "lucide-react";
import {
  MARKET_PRESETS, countryName, knownCountries, normaliseCountry,
  type MarketTier, type TargetMarket,
} from "@/shared/market";

// Where does this business actually sell?
//
// The brand carried `location` — one line of free text, used as a hint in
// prompts. It could not answer the question that decides whether a rising
// impressions count is a result or a distraction, so nothing asked it.
//
// Tiers are the customer's to set. There is no built-in list of "important"
// countries here and there is not going to be one: which countries matter is a
// fact about a particular business, and any ranking shipped in the product
// would be an opinion applied to every customer who never asked for it. The
// presets are conveniences with plain names, and all of them are editable.

const TIER_LABEL: Record<MarketTier, string> = {
  primary: "Main market",
  secondary: "Also sell here",
};

export default function MarketPicker({
  value,
  onChange,
}: {
  value: TargetMarket;
  onChange: (next: TargetMarket) => void;
}) {
  const [city, setCity] = useState("");
  const [adding, setAdding] = useState("");
  const all = useMemo(() => knownCountries(), []);
  const chosen = new Set(value.countries.map((c) => c.code));

  const setTier = (code: string, tier: MarketTier) =>
    onChange({ ...value, countries: value.countries.map((c) => (c.code === code ? { ...c, tier } : c)) });

  const add = (code: string) => {
    const c = normaliseCountry(code);
    if (!c || chosen.has(c)) return;
    // First country added is the main market — that is what someone means when
    // they pick one country, and making them set it twice is friction for
    // nothing.
    const tier: MarketTier = value.countries.some((x) => x.tier === "primary") ? "secondary" : "primary";
    onChange({ ...value, countries: [...value.countries, { code: c, tier }] });
    setAdding("");
  };

  const remove = (code: string) =>
    onChange({ ...value, countries: value.countries.filter((c) => c.code !== code) });

  const addCity = () => {
    const t = city.trim();
    if (!t || value.cities.some((c) => c.toLowerCase() === t.toLowerCase())) { setCity(""); return; }
    onChange({ ...value, cities: [...value.cities, t] });
    setCity("");
  };

  return (
    <div className="rounded-lg border border-white/[0.07] bg-ink-900/40 p-4">
      <div className="mb-1 flex items-center gap-2">
        <Globe2 className="h-4 w-4 text-emerald-400" />
        <h3 className="text-sm font-semibold text-white">Where you sell</h3>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-slate-400">
        Every module uses this: which countries a report counts, where prospects are searched for, which market the
        AI-visibility questions are asked about. Impressions from outside it are reported separately rather than added to
        a number you would act on.
      </p>

      {/* Presets — a starting point, not a ranking of countries. */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {MARKET_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => onChange({ ...p.build(), cities: value.cities })}
            className="rounded-lg border border-white/15 px-2.5 py-1 text-[11px] text-slate-200 hover:bg-white/[0.06]"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Chosen countries, each with its tier. */}
      {value.countries.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {value.countries.map((c) => (
            <div key={c.code} className="flex flex-wrap items-center gap-2 rounded-md bg-white/[0.03] px-2.5 py-1.5">
              <span className="text-xs font-medium text-white">{countryName(c.code)}</span>
              <span className="text-[10px] text-slate-500">{c.code}</span>
              <div className="ml-auto flex items-center gap-1">
                {(["primary", "secondary"] as MarketTier[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTier(c.code, t)}
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                      c.tier === t ? "bg-emerald-500/15 text-emerald-300" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {TIER_LABEL[t]}
                  </button>
                ))}
                <button onClick={() => remove(c.code)} className="ml-1 text-slate-500 hover:text-rose-300" title="Remove">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Add a country</label>
          <select className="input" value={adding} onChange={(e) => add(e.target.value)}>
            <option value="">Choose…</option>
            {all.filter((c) => !chosen.has(c.code)).map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">
            Cities or areas <span className="text-slate-500">(for a business smaller than a country)</span>
          </label>
          <div className="flex gap-1.5">
            <input
              className="input" placeholder="e.g. Croydon" value={city}
              onChange={(e) => setCity(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCity(); } }}
            />
            <button className="shrink-0 rounded-lg border border-white/15 px-2.5 text-white hover:bg-white/[0.06]" onClick={addCity} title="Add">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {value.cities.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {value.cities.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 rounded bg-white/[0.05] px-2 py-0.5 text-[11px] text-slate-200">
                  {c}
                  <button onClick={() => onChange({ ...value, cities: value.cities.filter((x) => x !== c) })} className="text-slate-500 hover:text-rose-300">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {value.countries.length === 0 && value.cities.length === 0 && (
        <p className="mt-3 rounded-md bg-amber-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-amber-200">
          Nothing set yet. Reports will show totals without saying how much of them is from somewhere you sell to — which
          is how a number goes up while the business does not.
        </p>
      )}
    </div>
  );
}
