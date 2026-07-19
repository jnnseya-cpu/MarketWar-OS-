// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Real-Time Search & Opportunity Intelligence Layer (Serper-inspired).
//
// A fast structured-search gateway (Search / News / Places / Shopping / Images)
// that powers opportunity discovery, competitor tracking and a local lead
// machine. Built like every other gateway: env-gated live provider
// (SERPER_API_KEY → Serper.dev REST) with an always-on deterministic demo mode
// so zero-config never breaks. External search is an OPTIONAL accelerator —
// the OS stays fully useful without it (independence doctrine).

export type SearchType = "search" | "news" | "places" | "shopping" | "images";

export type SearchResult = { title: string; link?: string; snippet?: string; extra?: Record<string, string | number | undefined> };
export type SearchResponse = { query: string; type: SearchType; mode: "live" | "demo"; gl?: string; hl?: string; results: SearchResult[] };

const seed = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };
const pick = <T,>(arr: T[], n: number): T => arr[n % arr.length];

function serperConfigured(): boolean { return Boolean(process.env.SERPER_API_KEY); }

// ---------------------------------------------------------------------------
// Structured search — live Serper.dev when keyed, deterministic demo otherwise
// ---------------------------------------------------------------------------
export async function webSearch(input: { query: string; type?: SearchType; gl?: string; hl?: string }): Promise<SearchResponse> {
  const type = input.type ?? "search";
  const query = input.query.trim();
  if (serperConfigured()) {
    try {
      const res = await fetch(`https://google.serper.dev/${type}`, {
        method: "POST",
        headers: { "X-API-KEY": process.env.SERPER_API_KEY as string, "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, gl: input.gl, hl: input.hl }),
      });
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        return { query, type, mode: "live", gl: input.gl, hl: input.hl, results: normaliseSerper(data, type) };
      }
    } catch {
      // fall through to demo
    }
  }
  return { query, type, mode: "demo", gl: input.gl, hl: input.hl, results: demoResults(query, type) };
}

function normaliseSerper(data: Record<string, unknown>, type: SearchType): SearchResult[] {
  const key = type === "search" ? "organic" : type === "news" ? "news" : type === "places" ? "places" : type === "shopping" ? "shopping" : "images";
  const arr = Array.isArray(data[key]) ? (data[key] as Record<string, unknown>[]) : [];
  return arr.slice(0, 10).map((r) => ({
    title: String(r.title ?? r.name ?? ""),
    link: typeof r.link === "string" ? r.link : typeof r.website === "string" ? r.website : undefined,
    snippet: typeof r.snippet === "string" ? r.snippet : typeof r.address === "string" ? r.address : undefined,
    extra: {
      ...(r.rating != null ? { rating: Number(r.rating) } : {}),
      ...(r.price != null ? { price: String(r.price) } : {}),
      ...(r.phoneNumber != null ? { phone: String(r.phoneNumber) } : {}),
    },
  }));
}

function demoResults(query: string, type: SearchType): SearchResult[] {
  const s = seed(query + type);
  const n = 6;
  return Array.from({ length: n }, (_, i) => {
    const k = s + i * 7;
    if (type === "places") {
      const noWeb = k % 3 === 0;
      return { title: `${pick(["Brixton", "Peckham", "Camden", "Hackney"], k)} ${query} #${i + 1}`, link: noWeb ? undefined : `https://example-${k % 97}.co.uk`, snippet: `${10 + (k % 90)} High St, London`, extra: { rating: Number((3 + (k % 20) / 10).toFixed(1)), phone: `+44 20 7${String(k % 1000).padStart(3, "0")} ${String(k % 10000).padStart(4, "0")}` } };
    }
    if (type === "shopping") return { title: `${query} — product ${i + 1}`, link: `https://shop-${k % 97}.co.uk`, extra: { price: `£${5 + (k % 60)}` } };
    if (type === "news") return { title: `${query}: ${pick(["surges", "shifts", "under pressure", "new entrant"], k)} (${pick(["BBC", "Reuters", "Sky", "FT"], k)})`, snippet: `Industry signal relevant to ${query}.` };
    return { title: `${query} — result ${i + 1}`, link: `https://result-${k % 97}.co.uk`, snippet: `Structured demo result for "${query}". Live Google data activates with SERPER_API_KEY.` };
  });
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

// ---------------------------------------------------------------------------
// Opportunity Discovery — scores a niche/market (spec: the Opportunity agent)
// ---------------------------------------------------------------------------
export type OpportunityReport = {
  niche: string; location: string;
  opportunityScore: number; demandLevel: "low" | "medium" | "high"; competitionLevel: "low" | "medium" | "high";
  suggestedProduct: string; targetCustomer: string; recommendedPrice: string; launchStrategy: string[];
  signals: { source: SearchType; note: string }[];
  honesty: string;
};

export async function discoverOpportunity(input: { niche: string; location?: string; currency?: string }): Promise<OpportunityReport> {
  const niche = input.niche.trim();
  const location = (input.location || "your area").trim();
  const cur = input.currency || "£";
  // Pull light signals from the search layer (demo or live) to ground the read.
  const [places, news] = await Promise.all([
    webSearch({ query: `${niche} ${location}`, type: "places" }),
    webSearch({ query: `${niche} trend`, type: "news" }),
  ]);
  const s = seed(niche + location);
  const supply = places.results.length; // proxy for competition
  const demand = clamp(45 + (s % 45) + (news.results.length > 3 ? 10 : 0));
  const competition = clamp(30 + supply * 6 + (s % 20));
  const opportunityScore = clamp(demand * 0.6 + (100 - competition) * 0.4);
  const noWebsiteShare = places.results.filter((r) => !r.link).length / Math.max(1, places.results.length);

  return {
    niche, location,
    opportunityScore,
    demandLevel: demand >= 70 ? "high" : demand >= 50 ? "medium" : "low",
    competitionLevel: competition >= 70 ? "high" : competition >= 50 ? "medium" : "low",
    suggestedProduct: `${niche} offer tuned for ${location} — lead with the gap incumbents ignore${noWebsiteShare > 0.3 ? " (many local rivals have weak/no web presence — an easy wedge)" : ""}.`,
    targetCustomer: `Local ${niche} buyers in ${location} with unmet demand for speed/trust/price.`,
    recommendedPrice: `${cur}${20 + (s % 40)}–${cur}${60 + (s % 80)} entry, tiered up (${STRATEGIC_NOTE})`,
    launchStrategy: [
      `Validate with a free ${niche} audit / lead magnet as the acquisition front door.`,
      demand >= 60 ? "Demand is there — move fast with a WhatsApp-first offer." : "Demand is soft — test a sharp offer before spending.",
      competition >= 60 ? "Crowded — differentiate on the competitor weakness the search signals expose." : "Low competition — land-grab local SEO + Google Business now.",
      "Recycle one campaign across all owned channels (email/WhatsApp/social) to compound reach.",
    ],
    signals: [
      { source: "places", note: `${supply} local providers found${noWebsiteShare > 0.3 ? `; ${Math.round(noWebsiteShare * 100)}% lack a proper website` : ""}.` },
      { source: "news", note: `${news.results.length} recent industry signals for "${niche}".` },
    ],
    honesty: "Scores are estimates from live/demo search signals, not guarantees. Validate demand with a real lead magnet before committing spend.",
  };
}
const STRATEGIC_NOTE = "priced for value, protected by the ACU margin floor";

// ---------------------------------------------------------------------------
// Local Lead Machine — Maps/Places → scored leads (spec: the lead machine)
// ---------------------------------------------------------------------------
export type Lead = {
  name: string; website?: string; phone?: string; address?: string; rating?: number;
  leadScore: number; flags: string[]; outreachAngle: string;
};
export type LeadReport = { category: string; location: string; mode: "live" | "demo"; leads: Lead[]; summary: string };

export async function findLocalLeads(input: { category: string; location: string }): Promise<LeadReport> {
  const category = input.category.trim();
  const location = input.location.trim();
  const res = await webSearch({ query: `${category} ${location}`, type: "places" });
  const leads: Lead[] = res.results.map((r) => {
    const rating = typeof r.extra?.rating === "number" ? (r.extra!.rating as number) : undefined;
    const noWebsite = !r.link;
    const poorRating = rating != null && rating < 4.0;
    const flags: string[] = [];
    if (noWebsite) flags.push("no website");
    if (poorRating) flags.push(`low rating (${rating})`);
    // Higher opportunity = weaker digital presence we can fix.
    const leadScore = clamp(40 + (noWebsite ? 35 : 0) + (poorRating ? 20 : 0) + (rating != null && rating >= 4.5 ? -15 : 0));
    return {
      name: r.title, website: r.link, phone: r.extra?.phone as string | undefined, address: r.snippet, rating,
      leadScore, flags: flags.length ? flags : ["healthy presence"],
      outreachAngle: noWebsite ? "Offer a done-for-you landing page + Google Business fix — they're invisible online."
        : poorRating ? "Offer reputation recovery + review-generation — their rating is costing them customers."
        : "Offer a growth audit — even strong locals leak revenue on follow-up.",
    };
  }).sort((a, b) => b.leadScore - a.leadScore);

  const hot = leads.filter((l) => l.leadScore >= 70).length;
  return {
    category, location, mode: res.mode, leads,
    summary: `${leads.length} ${category} leads in ${location}; ${hot} high-opportunity (weak/no web presence). ${res.mode === "demo" ? "Live Google Places data activates with SERPER_API_KEY." : ""}`.trim(),
  };
}

// ---------------------------------------------------------------------------
// Lightweight SEO/keyword proxy (spec: SEO engine — foundation slice)
// ---------------------------------------------------------------------------
export type KeywordReport = { seed: string; keywords: { term: string; volumeProxy: number; competitionProxy: number }[]; peopleAlsoAsk: string[]; relatedSearches: string[] };

export function keywordResearch(input: { seed: string; location?: string }): KeywordReport {
  const base = input.seed.trim();
  const loc = input.location?.trim();
  const mods = ["near me", "best", "cheap", "affordable", loc || "local", "reviews", "prices", "open now", "delivery", "booking"];
  const s = seed(base + (loc || ""));
  return {
    seed: base,
    keywords: mods.map((m, i) => ({
      term: `${base} ${m}`.trim(),
      volumeProxy: clamp(30 + ((s >> i) % 70)),
      competitionProxy: clamp(20 + ((s >> (i + 3)) % 75)),
    })).sort((a, b) => b.volumeProxy - a.volumeProxy),
    peopleAlsoAsk: [`How much does ${base} cost?`, `Is ${base} worth it?`, `Best ${base} ${loc || "near me"}?`, `How to choose a ${base}?`],
    relatedSearches: [`${base} ${loc || "local"}`, `${base} deals`, `${base} vs alternatives`, `top ${base}`],
  };
}
