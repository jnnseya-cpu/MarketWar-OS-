# Source notes — original product spec

> Verbatim import of document 1, lines 1–424. Original MarketWar OS product specification — agents, modules, pricing tiers, ACU model, tech stack, Firestore collections, MVP build order.

```
Product Name: MarketWar OS

An AI-powered agentic marketing operating system for small businesses that cannot afford to waste money on ads.

Current market direction is clear: Meta is pushing full AI ad automation through Advantage+, while AI social tools already cover content, scheduling, engagement and analytics. The gap is not another posting tool. The opportunity is an AI Marketing War Room that turns every £1 into tracked experiments, kills losing campaigns fast, and forces marketing to produce leads/customers, not vanity metrics.

Core Promise

“Stop guessing. Launch, test, kill, improve, and convert automatically.”

MarketWar OS should help users who spent £100s or £1000s with no customers by answering:

Why did the marketing fail? Who exactly should we target? What offer will make people act? Which ad/post/message should run today? What should be stopped immediately? Where is the customer leaking?

Killer Differentiator

Most tools create content.

MarketWar OS must diagnose the business, rebuild the offer, create campaigns, launch experiments, track leads, and tell the user exactly what to do next.

Main AI Agents

Business Diagnosis Agent Audits the product, pricing, audience, landing page, offer, past ads, website, social pages and conversion funnel.

Customer Pain Agent Finds the real pain points, objections, buying triggers and emotional hooks.

Offer Builder Agent Creates irresistible offers: discount, bundle, guarantee, urgency, referral reward, free trial, lead magnet.

Ad Creative Agent Generates Facebook, Instagram, TikTok, Google and LinkedIn ad copy, hooks, scripts, images prompts and video scripts.

Campaign Commander Agent Builds test campaigns with small budgets and clear objectives.

Budget Protection Agent Stops waste. If campaigns spend money without leads, it pauses them and recommends changes.

Lead Capture Agent Creates landing pages, WhatsApp flows, forms, email/SMS follow-up and retargeting sequences.

Competitor Spy Agent Monitors competitors, offers, ads, pricing and positioning.

Local Growth Agent Creates hyper-local campaigns for restaurants, delivery, tutors, construction, events, services and local businesses.

Revenue Intelligence Agent Shows what actually produced leads, bookings, sales, calls, WhatsApp messages or app downloads.

Platform Modules

Marketing Failure Audit
User enters:

Business name

Website

Social links

Product/service

Past ad spend

Result achieved

Target location

Target customer

Current price

Current offer

The system returns:

Conversion risk score

Offer weakness score

Audience mismatch score

Landing page score

Trust score

Ad creative score

Funnel leak map

“Why you got 0 customers” report

AI Campaign War Room
Dashboard shows:

Money spent

Leads generated

Cost per lead

Cost per message

Cost per booking

Best hook

Worst ad

Best audience

What to stop today

What to test tomorrow

One-Click Campaign Builder
User selects goal:

Get customers

Get WhatsApp messages

Get bookings

Get app downloads

Get restaurant partners

Get delivery drivers

Get investors

Get event ticket sales

Get email leads

The AI creates:

Campaign objective

Audience

Copy

Creative direction

CTA

Landing page

Follow-up messages

Retargeting ads

Budget split

AI Landing Page Generator
Every campaign gets a conversion page with:

Headline

Offer

Problem

Benefits

Proof

FAQ

CTA

WhatsApp button

Lead form

Tracking pixels

A/B testing

WhatsApp + SMS Conversion Engine
For small businesses, WhatsApp often converts better than websites.

Flow:

Ad → WhatsApp → AI qualification → offer → booking/order → follow-up → retargeting.

Content Factory
Creates:

30-day content calendar

Reels scripts

TikTok scripts

Facebook posts

LinkedIn posts

Instagram captions

Hashtags

Local community posts

Promotional campaigns

Before/after posts

Testimonial posts

AI Retargeting Engine
Tracks people who:

Clicked but did not buy

Messaged but disappeared

Viewed landing page

Started form

Watched video

Downloaded app but did not order

Then sends targeted follow-up.

Monetisation

Keep fees small but high-impact.

Free Plan

1 business audit

3 AI posts

1 campaign plan

Basic landing page preview

Starter — £9/month

30 AI posts/month

3 campaign plans

1 landing page

WhatsApp scripts

Basic analytics

Growth — £19/month

100 AI posts/month

10 campaign plans

3 landing pages

Competitor scan

Retargeting scripts

Lead follow-up automation

Pro — £39/month

Full AI War Room

Multi-platform campaigns

AI budget protection

A/B testing

CRM pipeline

Weekly growth report

Agency/White Label — £99/month

For people managing marketing for others.

ACU Model

Use AI credits to protect cost.

Example:

£1 = 100 ACUs

Charge:

Business audit: 50 ACUs

Campaign plan: 30 ACUs

Landing page: 80 ACUs

10 social posts: 40 ACUs

Competitor scan: 60 ACUs

Full funnel build: 150 ACUs

Tech Stack

Frontend

Next.js

Tailwind CSS

Shadcn UI

Framer Motion

Recharts

Firebase Auth

Backend

Firebase Functions

Firestore

Firebase Storage

Cloud Scheduler

Pub/Sub

Stripe Billing

Meta Marketing API

Google Ads API

TikTok API

LinkedIn API

WhatsApp Business API

SendGrid/Twilio

AI Layer

OpenAI

Gemini

Claude

Vertex AI

Internal AI Gateway

Provider cost tracking

ACU billing independent from provider

Database Core Collections

users businesses marketing_audits campaigns ad_creatives landing_pages leads lead_events competitor_scans ai_agents ai_runs acu_wallets subscriptions provider_costs performance_reports

MVP Build Order

Business audit engine

Campaign generator

Landing page generator

WhatsApp lead flow

AI content calendar

Performance dashboard

ACU wallet

Stripe subscription

Meta Ads integration

Competitor scanner

Strategic Positioning

Do not position it as:

“AI social media scheduler.”

Position it as:

“AI Marketing Recovery OS for businesses tired of wasting money on ads.”

Best First Target Users

Start with businesses that already feel marketing pain:

Restaurants

Food delivery platforms

Tutors

Cleaning businesses

Construction trades

Beauty salons

Event organisers

Small online shops

Recruitment platforms

Local service providers

Final Product Statement

MarketWar OS is an AI-powered marketing command centre that audits why campaigns fail, rebuilds the offer, creates ads, launches experiments, protects budgets, captures leads, follows up automatically, and shows exactly what produces customers.
```
