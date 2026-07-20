import { NextRequest, NextResponse } from "next/server";
import {
  discoverLocal, requestQuote, bookingOffer, demoProviders,
  type DiscoveryFilters, type QuoteRequest, type Provider,
} from "@/backend/local-marketplace";

// Local Marketplace API (spec: Yelp-class Local Discovery, Reviews, Booking &
// Lead Generation). Owned lead-gen infrastructure — not a Yelp wrapper.
// POST { action: "discover", filters?, providers? }        → ranked directory
// POST { action: "quote", request{category,city,…}, providers? } → matched providers
// POST { action: "book", request{providerId,service,…}, providers? } → booking offer
// GET  → doctrine + demo directory + a worked discovery/quote/booking example

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "discover";
  const providers = Array.isArray(body.providers) && body.providers.length ? (body.providers as Provider[]) : demoProviders();

  if (action === "discover") {
    return NextResponse.json({ hits: discoverLocal(providers, (body.filters as DiscoveryFilters) ?? {}) });
  }

  if (action === "quote") {
    const request = (body.request as QuoteRequest) ?? {};
    if (!request.category || !request.city) return NextResponse.json({ error: "quote requires request.category and request.city" }, { status: 400 });
    return NextResponse.json(requestQuote(request, providers));
  }

  if (action === "book") {
    const request = (body.request as { providerId?: string; service?: string; partySize?: number; dayOffsets?: number[] }) ?? {};
    const provider = providers.find((p) => p.id === request.providerId);
    if (!provider) return NextResponse.json({ error: "book requires request.providerId matching a known provider" }, { status: 400 });
    if (!request.service) return NextResponse.json({ error: "book requires request.service" }, { status: 400 });
    return NextResponse.json(bookingOffer({ providerId: provider.id, service: request.service, partySize: request.partySize, dayOffsets: request.dayOffsets }, provider));
  }

  return NextResponse.json({ error: "Unknown action — use discover, quote or book" }, { status: 400 });
}

export async function GET() {
  const providers = demoProviders();
  const hits = discoverLocal(providers, { category: "Plumber", city: "London" });
  const quote = requestQuote({ category: "Plumber", city: "London", postcodePrefix: "SW9", budgetGbp: 150, urgency: "urgent" }, providers);
  const booking = bookingOffer({ providerId: "p1", service: "Table for 4", partySize: 4 }, providers[0]);
  return NextResponse.json({
    engine: "Local Marketplace Engine — owned Local Discovery + Request-a-Quote + Booking",
    doctrine: "Owned local lead-gen infrastructure, not a Yelp wrapper. Match scores are labelled estimates from trust/proximity/budget-fit/responsiveness — never fabricated demand. Booking reminders are transactional and respect the consent/frequency architecture.",
    demoProviders: providers,
    exampleDiscovery: hits,
    exampleQuote: quote,
    exampleBooking: booking,
  });
}
