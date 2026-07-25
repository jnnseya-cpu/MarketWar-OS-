# Search / OMNIRANK — production readiness (honest GO/NO-GO)

The rule that governs this: **real output or an honest "connect a source" — never a
faked number.** Below is exactly what a tester can use this morning vs. what
physically needs an external data key/infra (and which one).

## ✅ LIVE NOW — testable this morning, no external data needed
| Capability | Where | What it does |
|---|---|---|
| **SEO Workbench** | Search Dominance → "SEO Workbench" | Generates real, valid **JSON-LD** (Organization/LocalBusiness/WebSite/Product), **llms.txt**, and **optimised meta tags** from your brand. Copy-paste ready. Never invents ratings/prices. |
| Search intent classifier | Search Dominance | Query → intent + funnel + commercial signals. |
| Opportunity Score | Search Dominance | Transparent 0–100 priority (revenue up / difficulty down). |
| Search Dominance Score | Search Dominance | 14-component 0–100 + weakest-5 with actions. |
| Dominion Score | OMNIRANK | 5-vital composite; Opportunity score (Volume×Intent×Feature×Winnability÷Effort). |
| Operating model | both | Modes, 13-stage loop, money-map, 53+22 agent rosters, Sentinel gate, guardrails, ACU economy, rollout, success criteria — all surfaced. |
| Content / metadata / briefs | Content Factory, SEO Blog Studio, Search Dominance | AI-generated from your inputs (uses your configured AI key). |
| Competitor teardown | Competitor Spy (MW-21) | Live competitor war-room. |
| Social amplification | Reach Amplifier (MW-19) | Live. |
| Reputation | Reputation Shield (MW-22 defence) | Live. |
| Local | Local Domination (§20) | Live. |
| Email ESP | Email Center + Sending Domains + Inbox | Own mail server, DKIM, tracking, warm-up, inbound. |

## 🔌 NEEDS A DATA SOURCE — real, but gated on an external key/API (not fakeable)
These are marked "connect a source" in the UI. They are **not** blueprint hand-waving
— the code path is built; it needs the data feed to return truth instead of a made-up
number. This is the same honesty line as the email sending IP.

| Capability | Needs | Why it can't be faked |
|---|---|---|
| Live rank tracking / Rank Matrix (MW-14) | SERP data (DataForSEO / SerpAPI) **or** Google Search Console API | Positions are external facts; inventing them is a lie a tester would catch. |
| Backlink profile / reclamation / displacement (MW-15) | Ahrefs / DataForSEO backlink index | Nobody has the full web link graph without an index. |
| Live AI-citation / Share-of-Answer (MW-16 monitoring) | Provider keys to run prompts across GPT/Claude/Gemini/Perplexity at scale | Requires actually querying the engines repeatedly. |
| Crawl mesh / entity graph / index ledger (MW-14) | Crawl workers + Neo4j (infra) | Needs running crawlers + a graph DB. |
| CWV / log-file / index coverage (MW-18) | Google Search Console API + PageSpeed API | Real site telemetry. |
| Revenue attribution (§27) | GSC + GA4 + your revenue data | Ties clicks to money — needs both ends connected. |

**To light these up:** connect Google Search Console (free) + GA4 first — that alone
activates rank, index, CWV and attribution. Add DataForSEO/Ahrefs for backlinks/SERP
features. Add provider keys for live AI-citation monitoring.

## 🧱 INFRASTRUCTURE (like the email IP) — provision when volume justifies
The autonomous 4-hourly crawl swarm, Neo4j entity graph, Kafka bus and ClickHouse
rank timeseries (ES-05 §6) are a horizontal build, on the roadmap. The command layer,
scoring, artifact generation and honest gating are all live without them.

## The honest pitch (ES-05 §12, held)
We win the winnable, defend the won, and detect the loss before the client does —
the only system closing the loop listening → intelligence → AI-answer capture →
authority → defence in one graph. No guaranteed #1; Sentinel refuses black-hat.
