// WHICH OF THE ACCOUNT'S WEBHOOK ENDPOINTS IS THIS DEPLOYMENT'S?
//
// The symptom was "246 events delivered, nothing landing", on an account with
// SEVEN webhook endpoints. That has three possible causes and they are
// indistinguishable from the Stripe dashboard, because a failed delivery looks
// the same in all three:
//
//   • No endpoint points at this app at all — Stripe is posting somewhere else.
//   • An endpoint points at the right PATH on the wrong HOST. Stripe does not
//     follow redirects, so an endpoint on the apex when the app serves www is
//     recorded as a failure on every single event.
//   • Several endpoints point here, and only one signing secret can be
//     configured, so deliveries to the others fail a signature check.
//
// Two of those three are answerable read-only, and this is the answer. Pure, so
// the branch that decides between them is testable without a Stripe account —
// which matters, because it was previously inline in a route that could only be
// exercised with a live key, and that is the same as untested.
//
// IT NEVER TOUCHES A SECRET. Stripe returns signing secrets only when an
// endpoint is created, never on a list, so no diagnostic can compare them for
// you. This narrows it to the ONE endpoint whose secret belongs in
// STRIPE_WEBHOOK_SECRET and says plainly that the comparison is yours to make.

export type StripeEndpointRow = {
  id: string;
  url: string;
  status: string;
  /** Points at this application's webhook path. */
  pointsAtThisApp: boolean;
  /** …and at the host actually serving us, which is the half that gets missed. */
  hostServingThisRequest: boolean;
  /**
   * The number of event TYPES this endpoint subscribes to — NOT deliveries.
   *
   * It was called `events`, and that was a real fault in a diagnostic: the
   * owner read "246" beside every endpoint and understood it as 246 delivered
   * events, which is exactly the reading the name invites. Stripe has around
   * 250 event types, so 246 means "subscribed to almost everything". A
   * diagnostic that invites a wrong reading is worse than one that says
   * nothing, because it is acted on.
   */
  enabledEventTypes: number;
  /** True when this endpoint subscribes to everything the app actually handles. */
  coversHandledEvents: boolean;
  /** The handled events this endpoint is NOT subscribed to. Empty is correct. */
  missingEvents: string[];
};

export type EndpointVerdict = {
  count: number;
  endpoints: StripeEndpointRow[];
  /** How many point here on the right host. One is correct; anything else is a fault. */
  matching: number;
  /** Right path, wrong host — the redirect trap. */
  wrongHost: number;
  problem: "none" | "no_endpoint" | "wrong_host" | "duplicates";
  verdict: string;
};

const hostOf = (url: string): string => {
  try { return new URL(url).host.toLowerCase(); } catch { return ""; }
};

/** One row from `GET /v1/webhook_endpoints`, checked rather than asserted. */
export function endpointFromStripe(raw: unknown, servingHost: string, webhookPath: string, handled: readonly string[] = []): StripeEndpointRow {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const url = typeof r.url === "string" ? r.url : "";
  const host = hostOf(url);
  const enabled: string[] = Array.isArray(r.enabled_events)
    ? r.enabled_events.filter((e): e is string => typeof e === "string")
    : [];
  return {
    id: typeof r.id === "string" ? r.id : "",
    url,
    status: typeof r.status === "string" ? r.status : "",
    pointsAtThisApp: Boolean(url) && url.endsWith(webhookPath),
    // Compared, never assumed. Hardcoding this true is what makes a wrong-host
    // endpoint — the likeliest cause of the whole fault — invisible.
    hostServingThisRequest: Boolean(servingHost) && host === servingHost.trim().toLowerCase(),
    enabledEventTypes: enabled.length,
    // `["*"]` is Stripe's "everything", and it genuinely covers everything.
    coversHandledEvents: enabled.includes("*") || handled.every((h) => enabled.includes(h)),
    missingEvents: enabled.includes("*") ? [] : handled.filter((h) => !enabled.includes(h)),
  };
}

export function classifyEndpoints(input: {
  rows: unknown[];
  servingHost: string;
  webhookPath: string;
  /** The events the app actually acts on, so an under-subscribed endpoint is caught. */
  handledEvents?: readonly string[];
}): EndpointVerdict {
  const handled = input.handledEvents ?? [];
  const endpoints = input.rows.map((r) => endpointFromStripe(r, input.servingHost, input.webhookPath, handled));
  const here = endpoints.filter((e) => e.pointsAtThisApp && e.hostServingThisRequest);
  const wrongHost = endpoints.filter((e) => e.pointsAtThisApp && !e.hostServingThisRequest);
  const servingUrl = input.servingHost ? `https://${input.servingHost}${input.webhookPath}` : `…${input.webhookPath}`;

  if (here.length === 1) {
    return {
      count: endpoints.length, endpoints, matching: 1, wrongHost: wrongHost.length, problem: "none",
      verdict: here[0].coversHandledEvents
        ? `Exactly one endpoint points at this app on this host (${here[0].id}), and it subscribes to every event the app acts on. The URL and the event selection are both correct, so if payments still are not landing the only thing left is the signing secret: open that endpoint in Stripe, reveal its secret, and compare it with STRIPE_WEBHOOK_SECRET.`
        : `One endpoint points at this app on this host (${here[0].id}), but it is NOT subscribed to ${here[0].missingEvents.length} event${here[0].missingEvents.length === 1 ? "" : "s"} the app acts on: ${here[0].missingEvents.join(", ")}. Those simply never arrive, so the money they carry never lands and nothing anywhere records an error. Add them to the endpoint in Stripe.`,
    };
  }
  if (here.length > 1) {
    return {
      count: endpoints.length, endpoints, matching: here.length, wrongHost: wrongHost.length, problem: "duplicates",
      verdict: `${here.length} endpoints point at this app on this host (${here.map((e) => e.id).join(", ")}). Stripe posts to all of them and only ONE signing secret can be configured here, so every delivery to the others fails a signature check and is recorded as an error. Delete the duplicates and keep one.`,
    };
  }
  if (wrongHost.length) {
    return {
      count: endpoints.length, endpoints, matching: 0, wrongHost: wrongHost.length, problem: "wrong_host",
      verdict: `No endpoint points at this app on the host serving this request, but ${wrongHost.length} point at the right path on a DIFFERENT host (${wrongHost.map((e) => e.url).join(", ")}). Stripe does not follow redirects, so if that host redirects here every delivery is recorded as failed and nothing ever reaches the route — which is exactly what "delivered events, nothing landing" looks like. Point the endpoint at ${servingUrl}.`,
    };
  }
  return {
    count: endpoints.length, endpoints, matching: 0, wrongHost: 0, problem: "no_endpoint",
    verdict: endpoints.length
      ? `None of the ${endpoints.length} endpoints on this account point at this app's webhook path. That alone explains delivered events and nothing landing: Stripe is posting somewhere else entirely. Add an endpoint at ${servingUrl}.`
      : `This account has no webhook endpoints at all, so nothing is being delivered anywhere. Add one at ${servingUrl}.`,
  };
}
