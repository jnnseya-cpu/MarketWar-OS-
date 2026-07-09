# 09 — MarketWar AI Video War Room

**Module M-31 · Status: specification adopted; Phase-0 agents + dashboard shipped.**
A full AI video creation, editing, translation, branding, repurposing and
campaign-launch engine: any business turns one idea into global video
campaigns in minutes. Derived from a competitive extraction of VEED's
browser-based video platform, upgraded with the OS's outcome-first doctrine —
VEED creates video; the Video War Room creates **profit-focused campaigns**.

Positioning rule (inherits the platform doctrine): every video artefact must
route attention into an owned channel with a tracked CTA. No video ships
without a campaign context, an audience and a measurable objective.

---

## 1. Sub-systems (feature-complete inventory)

### 1.1 AI Video Generator
User actions: prompt-to-video · script-to-video · product demo · explainer ·
testimonial · social ad · thought-leadership · character/avatar video ·
image-to-video · PPT/PDF-to-video.

**OS enhancement — One-Click Campaign Video:** from business name, product,
website, offer and target audience, AI generates script, scenes, voiceover,
subtitles, visuals, CTA and platform versions — auto-creating TikTok, Reels,
Shorts, Facebook, LinkedIn and YouTube variants. *(Shipped as the
`video-commander` agent.)*

### 1.2 Online Video Editor
Cut · trim · split · crop · resize · rotate · flip · merge/join · add text ·
add images · add logos · add stickers/emojis · overlays · transitions ·
filters/effects · brightness adjust · speed change · loop · frame/border ·
blur/censor objects · watermark removal (where legally allowed) ·
multi-format export. Browser-based editing with AI captions, filler-word
removal, silence cutting and audio cleaning.

### 1.3 AI Subtitle & Caption Engine
Auto-subtitles · manual editor · style presets · dynamic captions · karaoke
captions · word-by-word highlight · SRT/VTT export · burned-in captions ·
multi-language caption translation · caption timing editor.

**OS caption modes** *(shipped as the `caption-engine` agent)*:
- **Sales Caption Mode** — captions optimised for conversion
- **Education Caption Mode** — clearer academic explanations
- **Viral Caption Mode** — TikTok/Reels punchy text
- **Brand Caption Mode** — uses logo colours automatically

### 1.4 AI Translation & Dubbing
Subtitle translation · voice translation · AI dubbing · voice cloning ·
multi-language export · same video in 10–50 languages (target parity:
125+ languages) · localised captions and CTAs.

**OS upgrade — Global Reach Agent** *(shipped)*: one video auto-produces
versions for English, French, Lingala, Swahili, Portuguese, Arabic, Spanish
and more — auto-localising currency, location, tone, cultural references
and CTA.

### 1.5 AI Avatar Studio
Text-to-avatar video · AI presenter · talking-head · avatar explainer ·
avatar sales pitch · avatar training video · avatar course lesson ·
avatar testimonial-style video.

**OS avatar roster:** business avatars · teacher avatars · doctor/legal/
travel/property avatars · influencer-style avatars · custom branded company
spokesperson · multi-language avatar speech.

### 1.6 Audio Studio
Text-to-speech · voiceover generator · voice cloning · audio enhancer ·
background-noise remover · remove audio · extract audio · cutter/joiner/
looper · volume booster · audio translator · podcast cleaner.

**OS voice agents:** **Perfect Voice Agent** (best voice per audience) ·
**Ad Voice Agent** (persuasive emotional voiceovers) · **Course Voice Agent**
(slow, clear educational narration).

### 1.7 Screen, Webcam & Presentation Recorder
Screen recorder · webcam recorder · presentation recorder · teleprompter ·
webcam test · sound test · record slides with narration · record product
demo · record training content.

**OS upgrade:** auto-turn screen recordings into product demos, training
modules, social clips, help-centre videos and sales presentations.

### 1.8 Repurposing Engine
Long-video → short clips · platform resizing · templates · captions ·
platform-dimension export · multi-version social output · 4K export.

**OS one-to-many contract:** upload 1 long video → generate **10 TikToks ·
10 Reels · 10 Shorts · 5 LinkedIn clips · 5 Facebook ads · 1 blog article ·
1 email campaign · 1 landing-page script.**

### 1.9 Brand Kit
Logo upload · brand colours · fonts · brand templates · branded intro/outro ·
watermark · team brand control.

**OS upgrade:** auto-detect logo colours; every video follows the brand
theme; **AI rejects off-brand visuals** (Brand Guardian gate at generation
time); multiple brands per user/agency.

### 1.10 Collaboration & Team Workflow
Team workspace · shared projects · review comments · version history ·
brand permissions · project folders · video sharing · approval workflow.

**OS upgrade:** client approval portal (Approve / Reject / Request Change) ·
agency pipeline **creator → editor → manager → client → publish** · audit
trail for every change (writes to the platform audit log, M-25).

---

## 2. Where we beat the incumbent

### 2.1 Full Business Outcome Engine
Generate video → generate captions → generate ads → select audience →
launch campaign → track leads → retarget viewers → calculate ROI. Video is
a weapon inside the Campaign War Room (M-06/M-13/M-14), not a standalone file.

### 2.2 Video agent corps (Command Centre roster)
Script Agent · Offer Agent (shared with M-06) · Video Editor Agent · Avatar
Agent · Voice Agent · Subtitle Agent · Translation Agent · **Brand Guardian
Agent** · Compliance Agent · Platform Export Agent · Performance
Optimisation Agent. All operate under the Master Directive and the autonomy
model in `03-agent-ecosystem.md` (Brand Guardian and Compliance run at L3 as
generation-time gates; publishing actions are L2 with spend/exposure caps).

### 2.3 One-Click Commercial Campaign
Input: business name · product/service · website · target customer ·
budget · goal.
Output: **5 videos · 10 captions · 5 ad copies · landing page · email
campaign · WhatsApp campaign · follow-up sequence · analytics dashboard.**

### 2.4 Vertical-specific video modes
Restaurants · travel agencies · schools · tutors · lawyers · estate agents ·
construction/tradesmen · churches · events · influencers · e-commerce ·
government campaigns · healthcare · job recruitment. Each mode ships as a
pack (M-06 pack library) with vertical hooks, proof patterns and CTA norms.

### 2.5 ACU-based monetisation
Metered actions: auto-subtitles · translation · dubbing · avatar generation ·
voice cloning · export quality · video length · brand-kit usage · bulk
campaign generation · publishing automation. **Pricing rule: minimum 4×
provider cost**, surfaced transparently to the user (consistent with the
ACU economics framework — see the margin-rule reconciliation in
`../REQUIREMENTS-COVERAGE.md` §Gaps).

---

## 3. Technical placement (per the adopted production architecture)

| Concern | Home |
|---|---|
| Studio UI, brief intake, previews | Vercel frontend (`/dashboard/video`) |
| Script/caption/localisation generation | AI Gateway (`src/lib/ai/gateway.ts`) via agent contracts |
| Rendering, dubbing, avatar synthesis, transcoding | **Cloud Run** (heavy compute, §8 of PRODUCTION-ARCHITECTURE) behind a provider-adapter layer (same pattern as the AI Gateway: swap video/voice providers without app changes) |
| Media assets, brand kits, exports | Firebase Storage (tenant-scoped rules) |
| Jobs, versions, approvals, ACU metering | Firestore collections: `video_projects`, `video_jobs`, `video_versions`, `video_captions`, `video_translations`, `video_avatars`, `brand_kits`, `video_approvals`, `video_publish_targets`, `video_metrics` |
| Publishing to platforms | Connector ecosystem (M-26/doc 05): Meta, TikTok, YouTube, LinkedIn |
| ROI attribution | Revenue Intelligence (M-14) joins `video_metrics` to leads/orders |

Build phasing: **P0 (shipped)** agents + dashboard · **P1** captions/SRT
pipeline + repurposing briefs · **P2** Cloud Run render farm + avatar/dubbing
providers + brand-kit enforcement · **P3** approval portal + auto-publishing.

---

# v2 — VideoCommandCentre expansion

Second extraction pass (2026-07-09). The module's internal codename is
**VideoCommandCentre**. Positioning: *do not copy the incumbent — become
VEED + Canva + CapCut + HeyGen + ad strategist + campaign manager +
compliance officer + sales engine in one OS.* Everything below extends
(never replaces) v1 above.

## 4. Sub-system additions & expansions

- **§1.1 Prompt-to-Video Studio** additionally covers: tutorials,
  educational videos, sales videos, recruitment videos and
  influencer-style **UGC videos** from one prompt.
- **§1.2 AI Editing Timeline** additionally: progress bars and music;
  silence removal and filler-word removal are first-class actions.
- **§1.3 Subtitle & Translation Engine** additionally: subtitle animation,
  TXT export, closed captions; 100+/125+ language positioning for
  subtitles/transcription.
- **§1.4 AI Voice & Dubbing Studio** additionally: **lip sync**,
  audio-to-text, volume control.
- **§1.5 Avatar & UGC Actor Studio** additionally: **UGC testimonial
  actors** and product-explainer actors (actor-style, not just presenter).
- **§1.9 Brand Kit Control** additionally: CTA style, subtitle style,
  approved templates and **locked brand rules** for teams (template
  locking, permissions, approvals).
- **§1.8 Repurpose Engine** additionally: website hero videos, email GIFs
  and ad variations.
- **§1.7 Recorder** additionally: PPT-to-video, PDF-to-audio/video,
  training-video creator.

### 4.9 AI B-Roll & Visual Enhancer *(new sub-system)*
AI B-roll generator · image-to-video · video-to-video AI · AI image
generator · image extender · background remover · green screen · video
enhancer · upscaler · background expansion.

### 4.10 Publishing & Hosting *(new sub-system)*
Video hosting · share links · approval links · embed player · export to
platforms · scheduled publishing · campaign library.

## 5. The ten marketer-gap agents (what ships after the video exists)

| # | Agent | Contract | Status |
|---|---|---|---|
| 1 | **Campaign Intelligence Agent** | Pre-creation brief: goal, audience, offer, country, platform, budget, product price, competitor angle, emotional trigger → best script, hook, CTA, format | 📘 (v1 `video-commander` covers the generation half) |
| 2 | **Viral Hook Agent** | Generates 50 hooks; ranks by curiosity, pain, urgency, controversy, authority, scroll-stopping power | ✅ shipped (`viral-hook`) |
| 3 | **Competitor Ad Spy Agent** | Competitor name/site → positioning, offers, ad angles, content gaps → stronger video concepts | 📘 (composes with M-11 Competitor Intelligence) |
| 4 | **UGC Batch Factory** | 100 ad variations in one click: 10 hooks × 5 scripts × 5 avatars × 4 formats × 5 CTAs, ranked by predicted conversion | 📘 (batch matrix spec; ranking model P2) |
| 5 | **Sales Funnel Video Builder** | Auto-creates the 8-video funnel: awareness, problem, product demo, testimonial, offer, retargeting, abandoned-cart, thank-you | ✅ shipped (`funnel-video-builder`) |
| 6 | **AI Compliance Checker** | Checks claims, regulated wording, financial promises, medical claims, political content, copyright risk, music rights, brand misuse, platform ad-policy risk | ✅ shipped (`video-compliance`) |
| 7 | **Performance Feedback Loop** | Connects Meta, TikTok, YouTube, Google Ads, email; learns which hooks/captions/voices/thumbnails/CTAs convert | 📘 (instance of the platform learning loop, doc 06 §6) |
| 8 | **Auto-Thumbnail & Title Engine** | Thumbnails, titles, descriptions, hashtags, SEO tags, platform-specific captions | ✅ shipped (`thumbnail-title`) |
| 9 | **ACU Profit Control** | Meters: subtitles, translation, voice cloning, avatar generation, 4K export, B-roll, batch variations, compliance scan, publishing — minimum 4× provider cost, premium actions higher | 📘 (extends v1 §2.5) |
| 10 | **Human + AI Marketplace** | Designers/editors/influencers/marketers sell templates, voices, video packs, campaign services in-OS; platform commission | 📘 (instance of M-17 Marketplace, revenue stream R4) |

## 6. Developer-ready structure

**Routes** (under `/dashboard/video` in the shipped app; standalone paths at P2):
`/video/create` · `/video/editor` · `/video/templates` · `/video/brand-kit` ·
`/video/avatars` · `/video/subtitles` · `/video/translation` · `/video/voice` ·
`/video/repurpose` · `/video/campaigns` · `/video/publishing` ·
`/video/analytics` · `/video/compliance` · `/video/marketplace`

**Core actions** (service contract; each is ACU-metered and audit-logged):
`generateVideoFromPrompt` · `generateScript` · `generateHooks` ·
`uploadVideo` · `autoEditVideo` · `removeSilence` · `removeFillerWords` ·
`generateSubtitles` · `translateSubtitles` · `dubVideo` · `cloneVoice` ·
`generateAvatarVideo` · `generateBroll` · `resizeForPlatform` ·
`createAdVariations` · `applyBrandKit` · `checkCompliance` · `exportVideo` ·
`publishVideo` · `trackPerformance` · `deductACUs`

Additional Firestore collections for v2: `video_hooks`, `video_variations`,
`video_funnels`, `video_compliance_scans`, `video_thumbnails`,
`video_publish_schedule`, `video_marketplace_listings`,
`video_performance_events`.
