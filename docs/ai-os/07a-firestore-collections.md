# 07a — Firestore Production Collections (adopted from v3.0 spec §6.2)

The Phase-0/1 operational schema. Composes with `07-database-and-api.md`
(whose PostgreSQL DDL remains the Phase-2 relational contract) — collection
and field names here are the Firestore source of truth. Security-rule column
is binding: "service only" writes execute via the Admin SDK (which bypasses
client rules), so client-side rules deny those writes entirely —
`firestore.rules` implements this posture.

---

## 6.2.1 `users`

| Field | Type | Description | Index | Security rule |
|---|---|---|---|---|
| `uid` | string | Firebase Auth UID — primary key | Primary | Read: owner only; Write: auth service only |
| `email` | string | Verified email address | Single-field | Read: owner only |
| `role` | enum | `owner \| manager \| sales \| social \| agency_admin \| affiliate \| super_admin` | Single-field | Read: owner; Write: admin only |
| `plan` | enum | `free_trial \| starter \| growth \| pro \| agency \| enterprise` | Single-field | Read: owner; Write: billing service |
| `acuBalance` | number | Current ACU credit balance | — | Read: owner; **Write: billing service only** |
| `acuAlertThreshold` | number | Balance below which user is alerted | — | Read/Write: owner |
| `onboardingStatus` | enum | `pending \| audit_complete \| first_campaign \| active` | Single-field | Read/Write: owner + MOA |
| `agencyId` | string? | Agency account this user belongs to | Single-field | Read: owner + agency admin |
| `preferences` | map | Notifications, autonomy defaults, UI prefs | — | Read/Write: owner |
| `digitalTwinId` | string | Ref → `digital_twins` document | — | Read: owner + AI services |
| `mfaEnabled` | boolean | MFA status | — | Read: owner; Write: auth service |
| `createdAt` | timestamp | Account creation | Single (desc) | Read: owner + admin |
| `lastActiveAt` | timestamp | Last platform activity | Composite w/ `plan` | Read: owner + admin |

## 6.2.2 `businesses`

| Field | Type | Description |
|---|---|---|
| `businessId` | string | Auto-generated — primary key |
| `ownerId` | string | Ref → `users.uid` |
| `name` | string | Trading name |
| `industry` | string | Standardised category from taxonomy |
| `subIndustry` | string | Subcategory for precise benchmarking |
| `location` | geoPoint | Primary location (lat/lng) |
| `targetPostcodes` | array\<string\> | Service-area postcodes for the Local Domination Agent |
| `website` | string | Primary website URL |
| `socialLinks` | map | Facebook, Instagram, TikTok, LinkedIn, Google Business URLs |
| `brandVoice` | string | AI-extracted brand voice (tone, style, language patterns) |
| `brandColors` | array\<string\> | Hex codes for AI creative generation |
| `targetCustomerProfile` | string (vector ref) | Ref → latest Customer Pain Intelligence output in the vector store |
| `vitalityIndex` | number | Current BVI (0–100) — **updated every 15 minutes** |
| `vitalityTrend` | enum | `rising \| stable \| declining \| critical` |
| `autonomyLevel` | number 1–3 | Business-wide default autonomy level |
| `monthlyAdBudget` | number | Declared monthly ad budget |
| `diagnosticLastRun` | timestamp | Last Business Diagnosis Agent run |
| `competitorUrls` | array\<string\> | Top competitors for ongoing monitoring |
| `createdAt` | timestamp | Profile creation |

## 6.2.3 `agent_tasks` (master audit trail)

*The shipped `agent_runs` collection (`src/backend/db.ts`) is the Phase-0 seed of
this schema and upgrades into it — additive migration, no data loss.*

| Field | Type | Description |
|---|---|---|
| `taskId` | string | Auto-generated UUID — primary key |
| `agentType` | enum | `MOA \| diagnosis \| opportunity \| pain_intel \| offer_builder \| ad_creative \| campaign_cmd \| budget_protection \| lead_capture \| resurrection \| competitor \| local_domination \| revenue_intel \| growth_strategist \| content_factory \| whatsapp \| landing_page \| retargeting \| workflow \| marketplace \| profit_protection` |
| `businessId` / `userId` | string | Associated business; triggering/receiving user |
| `status` | enum | `queued \| processing \| completed \| failed \| escalated \| cancelled` |
| `priority` | number | MOA-assigned priority score (1–100) |
| `autonomyLevel` | number | Autonomy level at execution time (1–3) |
| `inputPayload` / `outputPayload` | map | Full structured I/O (output stored as reference if > 500 KB) |
| `reasoningTrace` | string | **Human-readable chain-of-thought for every autonomous decision** (the §4.1 transparency principle, materialised) |
| `acuCost` | number | ACUs consumed |
| `llmProvider` | string | `openai \| anthropic \| google \| groq \| vertex` |
| `llmModel` | string | Exact model version used |
| `llmCostUsd` | number | Actual API cost (margin calculation input) |
| `acuMarginPct` | number | **Calculated margin % on this task** (owner floor: ≥ 100%) |
| `humanEscalation` / `escalationReason` | boolean / string? | Whether human review was required, and why |
| `parentTaskId` | string? | Parent task for workflow sub-tasks |
| `createdAt` / `completedAt` / `durationMs` | timestamps / number | Timing + end-to-end duration |

## 6.2.4 Additional core collections (with binding retention)

| Collection | Purpose | Key fields | Retention |
|---|---|---|---|
| `campaigns` | Campaign definitions & config | campaignId, businessId, platform, status, objective, budget, audienceConfig, creativeAssets, aiConfidenceScore, autonomyLevel, pauseReason | 24 mo active + archive |
| `campaign_metrics` | Time-series performance per campaign | metricId, campaignId, date, spend, impressions, clicks, leads, conversions, ROAS, CPL, CAC, qualityScore | 36 mo — **BigQuery sync daily** |
| `customer_profiles` | AI-enriched customer records | customerId, businessId, name, email, phone, churnScore, purchaseProbability, LTV, preferredChannel, lastActivity, segments, resurrectionScore | 5 yr, **GDPR right-to-erasure** |
| `leads` | Inbound lead records | leadId, businessId, source, qualificationScore, status, touchHistory, assignedAgentFlow, conversionValue | 18 mo |
| `acu_ledger` | **Double-entry ACU accounting** | transactionId, userId, type (credit/debit), amount, taskId, balance, provider, marginPct, createdAt | **7 yr (financial compliance)** |
| `digital_twins` | AI twin state per user/business | twinId, userId, businessId, behaviourProfile, goalState, preferenceMap, riskProfile, communicationStyle, lastUpdated | Perpetual — core intelligence asset |
| `knowledge_graph_nodes` | Platform knowledge graph | nodeId, type, entityId, properties, embeddingId, relationships, lastUpdated | Perpetual — core intelligence asset |
| `opportunity_briefs` | Opportunity Discovery outputs | opportunityId, businessId, category, demandScore, competitionScore, captureScore, marginScore, timeScore, recommendedAction, status, detectedAt | 90 d |
| `workflow_definitions` | User/AI-defined automations | workflowId, businessId, name, trigger, conditions, steps, status, executionCount, lastExecuted | Perpetual |
| `compliance_logs` | GDPR, consent, audit trail | logId, userId, action, dataCategories, legalBasis, timestamp, ipAddress, userAgent | **7 yr (regulatory)** |
