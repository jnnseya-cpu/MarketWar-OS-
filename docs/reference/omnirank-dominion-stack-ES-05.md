# MARKETWAR OS — OMNIRANK DOMINION STACK (Engineering Spec ES-05) — source (verbatim)

> Immutable source import. Programme NSEYA X-EXECUTE. Modules MW-14→MW-22,
> APEX SWARM agents MW-A24→MW-A45. Design system: NAVY #0A1F44 · GOLD #C9A227 ·
> INK #111111. No credentials present.

## 0. Doctrine — the Rank War thesis
MarketWar does not chase rankings; it manufactures the conditions under which a
ranking is inevitable, then defends with automated counter-fire. 2026 truths:
search is an answer surface (AI Overviews/ChatGPT/Perplexity/Claude/Gemini/Copilot/
TikTok are citation engines — a brand that ranks #1 but is never cited is
invisible); backlinks are engineered not bought (link-buying/PBN/cloaking carry
terminal penalty risk — the moat is linkable-asset manufacturing + reclamation of
already-earned links); speed is the last unfair advantage (a 22-agent swarm
executing every 4h). **Dominion Objective:** for every target entity own the full
answer surface — organic position, SERP feature, AI citation, social result and
knowledge panel — simultaneously. **Non-negotiable (Rank Defense Doctrine):**
white-hat-only; any tactic that would trigger manual action, algorithmic demotion
or platform ban is rejected at the orchestration layer by MW-A45 (Sentinel) before
execution. Not a spam cannon — an inevitability machine.

## 1. Stack position
Extends the existing MarketWar OS closed loop (MW-01→MW-13, 23 agents) with the
execution + defence layer. Total post-merge: 22 modules · 45 agents · 1
orchestration graph.

## 2. Module registry MW-14 → MW-22
- **MW-14 OMNIRANK CORE (Entity & Index Substrate).** Crawl mesh (distributed
  headless, 500 URL/s ceiling, robots-respecting, JS-rendered); Entity Graph
  (Neo4j — brand/product/person/place/topic + sameAs); Index Ledger (live index
  status Google/Bing/Yandex/Naver + AI-crawler hit logs: GPTBot, ClaudeBot,
  PerplexityBot, Google-Extended); Rank Matrix (daily position × keyword × device
  × locale × SERP feature); Share-of-Answer (% of target prompts where client is
  cited, per AI engine). Output: `omnirank.entity_state`.
- **MW-15 AUTHORITY WARFARE (Backlink Engine).** Five white-hat automated rails:
  Reclamation (unlinked mentions, broken inbound, competitor 404 assets,
  image-use-without-attribution → auto outreach); Displacement (map top-5
  competitor backlinks, score winnability, generate superior replacement +
  pitch); Asset Forge (original data studies, calculators, tools, indices,
  benchmarks); Digital PR (journalist-request monitoring HARO/X/Bluesky/Qwoted →
  8-min expert response); Ecosystem (partner/supplier/association/alumni/
  sponsorship/citation-directory). Toxic Link Firewall: disavow-candidate scoring,
  negative-SEO auto-flag, rolling disavow file. KPI: referring-domain velocity vs
  competitor mean, target 3.0× within 90 days.
- **MW-16 ANSWER CAPTURE (GEO/AEO).** Prompt Universe Mapping (5k–50k prompts/
  vertical tested across GPT/Claude/Gemini/Perplexity/Copilot/AI Overviews);
  Citation Gap Ledger; Chunk-Level Optimisation (statement-first extractable
  passages); Fact Anchoring (verifiable uniquely-owned stats); Consensus Seeding
  (consistent claims across trusted sources); llms.txt + full schema. KPI:
  Share-of-Answer, target #1 recommended in ≥60% of commercial-intent prompts.
- **MW-17 CONTENT VELOCITY FORGE.** Topical-authority cluster map; brief→draft→
  human-in-loop gate→publish→internal-link auto-wiring; Decay Radar; Cannibalisation
  Resolver; quality gate (originality, E-E-A-T, author-entity binding). No
  unreviewed publish, ever.
- **MW-18 TECHNICAL SUPREMACY.** CWV continuous audit + code-level diffs (INP/LCP/
  CLS); crawl-budget + log-file analysis + orphan detection + index-bloat pruning;
  full schema graph; international (hreflang, ccTLD/subfolder, locale rendering);
  Regression Guard (CI/CD blocks deploys degrading indexability/CWV).
- **MW-19 SOCIAL SIGNAL AMPLIFICATION.** Platform-native search opt (TikTok/
  YouTube/Instagram/LinkedIn/Pinterest/Reddit/X); Atomiser (1 pillar → 14
  derivatives); community authority (disclosure-enforced, no astroturf); creator
  layer via the existing MarketWar creator/influencer programme.
- **MW-20 SERP FEATURE SNIPER.** Featured Snippet · PAA · AI Overview citation ·
  Image Pack · Video Carousel · Local Pack · Knowledge Panel · Sitelinks · Review
  Stars · FAQ Rich Result · Top Stories · Shopping Graph. Per feature: eligibility
  → structural prescription → deploy → verify → hold.
- **MW-21 COMPETITOR DISPLACEMENT.** Continuous top-10 teardown; Keyword Theft
  Engine (displacement probability, ROI-sequenced); Weakness Radar (expired
  domains, stale content, broken links, CWV failures, lost positions);
  Counter-Move Simulator.
- **MW-22 RANK DEFENCE / ALGORITHM SHIELD.** Volatility monitoring; penalty
  early-warning; negative-SEO defence; **Compliance Gate (MW-A45 Sentinel)** — hard
  block (not warning) on: paid link schemes, PBNs, cloaking, doorway pages,
  undisclosed AI mass-publishing, review manipulation, astroturf.

## 3. APEX SWARM agents MW-A24 → MW-A45 (LangGraph supervisor-worker, Kafka bus)
A24 Cartographer (MW-14 crawl orchestration); A25 Entity Weaver (MW-14 Neo4j
resolution); A26 Index Warden (MW-14 index/AI-crawler logs); A27 Rank Scribe
(MW-14 position matrix); A28 Reclaimer (MW-15 unlinked/broken recovery); A29
Siegebreaker (MW-15 competitor backlink + winnability); A30 Forgemaster (MW-15
linkable-asset briefs); A31 Envoy (MW-15 outreach); A32 Newshound (MW-15 8-min
expert response); A33 Oracle (MW-16 prompt universe + multi-engine test); A34
Citation Hunter (MW-16 citation-gap ledger); A35 Chunksmith (MW-16 passage
extractability); A36 Consensus (MW-16 cross-source claim consistency); A37 Cartel
(MW-17 cluster architecture); A38 Quill (MW-17 brief→draft→gate); A39 Necromancer
(MW-17 decay/refresh/cannibal); A40 Ironclad (MW-18 CWV/schema/regression guard);
A41 Megaphone (MW-19 social atomisation); A42 Sniper (MW-20 SERP feature capture);
A43 Vulture (MW-21 displacement); A44 Bastion (MW-22 volatility/negative-SEO); A45
★ Sentinel (MW-22 policy compliance hard-gate on all outbound actions).
Supervisor: APEX_ORCHESTRATOR — routes by opportunity score, enforces budget
ceilings, arbitrates conflicts, escalates to human review.

## 4. Orchestration graph & cadence
SENSE every 4h · DECIDE every 12h · BUILD/STRIKE daily · DEFEND continuous.

## 5. State schema & scoring
Opportunity Score = (SearchVolume × IntentValue × FeatureWeight) ×
WinnabilityProbability ÷ EffortUnits. Queue strictly ordered by score. No vanity
keywords, ever.

## 6. Technical architecture
NestJS · Next.js 14 · PostgreSQL · Kafka · Neo4j · LangGraph · Redis · ClickHouse
(rank timeseries) · Playwright grid. Core tables: entities, urls, keywords,
rank_history, prompts, answer_citations, backlinks, link_opportunities,
outreach_threads, content_assets, actions, policy_verdicts, acu_ledger.
Integrations: GSC, Bing Webmaster, GA4, GBP, Ahrefs/DataForSEO/SerpAPI,
Cloudflare, CMS connectors (WordPress/Webflow/Shopify/Next.js headless), Slack/
WhatsApp alerting, BitriPay billing.

## 7. ACU economy (portfolio ACU model; owner pricing law ≥100% margin applies)
URL crawl+parse 0.1 · keyword rank check 0.2 · AI prompt test 1.5 · backlink
profile refresh (per domain) 4.0 · link opportunity scoring 0.5 · outreach draft+
send 2.0 · content brief 8.0 · full draft 25.0 · technical audit (full) 40.0 ·
competitor full teardown 60.0. Tiers: SCOUT 5k ACU/mo · RAIDER 25k · WARLORD 100k
· DOMINION unlimited + dedicated swarm instance + white-glove review desk.
> Spec states a 66% gross-margin target; the MarketWar OWNER PRICING LAW overrides
> it — margin never below 100% (price ≥ 2× provider cost). Recorded as a conflict
> in REQUIREMENTS-COVERAGE §Gaps; the ≥100% floor governs.

## 8–9. API surface & Dominion Dashboard
Single navy/gold screen, five vitals: DOMINION SCORE (0–100 composite of organic
share, feature ownership, answer share, authority velocity, defence integrity);
SHARE OF ANSWER (per AI engine, trended); AUTHORITY VELOCITY (referring-domain
growth vs competitor mean, indexed); SURFACE MAP (keyword × SERP feature × owned/
contested/lost heatmap); THREAT BOARD (volatility, decay, negative-SEO, competitor
strikes).

## 10. 90-day rollout
P1 Substrate (0–21): MW-14, MW-18; agents A24–A27, A40. P2 Answer Layer (22–45):
MW-16, MW-20; A33–A36, A42. P3 Authority (46–70): MW-15, MW-17; A28–A32, A37–A39.
P4 Offence & Shield (71–90): MW-19, MW-21, MW-22; A41, A43–A45.

## 11. Success criteria (90 days, per tenant)
Non-brand organic sessions +180%; top-3 keyword count +250%; SERP features owned
≥40% of target set; Share of Answer (commercial) ≥60%; referring-domain velocity
3.0× competitor mean; CWV URLs passing ≥95%; content decay caught pre-drop ≥90%;
Sentinel policy violations reaching execution 0.

## 12. Strategic honesty — what this does and doesn't promise
**Guaranteed:** the fastest, most complete, most defensible execution of every
legitimate ranking and citation lever, running continuously, at a speed no human
agency can match — a real moat (most competitors execute ~5% of this playbook,
quarterly, by hand). **Not guaranteed by anyone:** literal #1 on every query on
every engine forever — engines are adversarial, ranking is relative, and any
vendor promising permanent #1 is lying or about to get the client penalised. The
differentiator: win the winnable, defend the won, and detect the loss before the
client does. The real unbeatable claim: the only system that closes the loop
listening → intelligence → AI-answer capture → authority acquisition → defence,
autonomously, in one graph.

--- END OF SPECIFICATION ES-05 ---
