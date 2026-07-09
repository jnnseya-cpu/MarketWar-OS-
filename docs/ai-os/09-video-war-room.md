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
