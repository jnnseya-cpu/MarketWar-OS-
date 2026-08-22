// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// GATHERING WHAT THERE IS TO SEARCH (§92).
//
// The matching and ranking live in `shared/entity-search.ts`, pure and tested.
// This half asks each module for its records and turns them into one shape.
//
// EVERY SOURCE IS OPTIONAL AND EVERY SOURCE CAN FAIL ALONE.
//
// A search that returns nothing because one collection threw is worse than a
// search that returns three of four sources and says so — the first looks like
// an empty account. Each gatherer is wrapped, and the sources that could not be
// read are NAMED in the result rather than quietly missing.

import { listItems } from "@/backend/approvals";
import { currentMemory } from "@/backend/brand-memory";
import { allFor as allExperiments } from "@/backend/experiment-history";
import { searchEntities, type SearchableEntity, type SearchOutcome } from "@/shared/entity-search";

export type GlobalSearchResult = SearchOutcome & {
  /** Sources that could not be read. Named, never silently dropped. */
  unavailable: string[];
};

type Gatherer = { name: string; run: (brandId: string) => Promise<SearchableEntity[]> };

const GATHERERS: Gatherer[] = [
  {
    name: "approvals",
    run: async (brandId) => (await listItems(brandId)).map((i) => ({
      id: i.id,
      kind: "approval" as const,
      title: i.title,
      subtitle: `${i.state.replace(/_/g, " ")}${i.assetUrl ? " · has a file" : ""}`,
      body: i.description,
      href: "/dashboard/approvals",
      at: i.history[i.history.length - 1]?.at,
    })),
  },
  {
    name: "brand memory",
    run: async (brandId) => (await currentMemory(brandId)).map((f) => ({
      id: `${f.key}`,
      kind: "brand_fact" as const,
      title: f.key.replace(/[._-]/g, " "),
      subtitle: `${f.source}${f.stale ? " · stale" : ""}`,
      body: String(f.value ?? ""),
      href: "/dashboard/strategy",
      at: f.observedAt,
    })),
  },
  {
    name: "experiments",
    run: async (brandId) => (await allExperiments(brandId)).map((x) => ({
      id: x.id,
      kind: "experiment" as const,
      title: x.idea,
      subtitle: `${x.outcome.replace(/_/g, " ")}${x.channel ? ` · ${x.channel}` : ""}`,
      body: [x.angleFamily, x.hookFamily, x.stoppedBecause].filter(Boolean).join(" "),
      href: "/dashboard/campaigns",
      at: x.concludedAt,
    })),
  },
];

export async function globalSearch(input: { brandId: string; query: string; limit?: number }): Promise<GlobalSearchResult> {
  const unavailable: string[] = [];
  const gathered: SearchableEntity[] = [];

  // Concurrently, and one failure never takes the others with it.
  await Promise.all(GATHERERS.map(async (g) => {
    try {
      gathered.push(...(await g.run(input.brandId)));
    } catch {
      unavailable.push(g.name);
    }
  }));

  const outcome = searchEntities(input.query, gathered, { limit: input.limit });
  return {
    ...outcome,
    unavailable,
    headline: unavailable.length
      ? `${outcome.headline} ${unavailable.length === 1 ? "One source" : `${unavailable.length} sources`} could not be read (${unavailable.join(", ")}), so this may be incomplete.`
      : outcome.headline,
  };
}
