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
  events: number;
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
export function endpointFromStripe(raw: unknown, servingHost: string, webhookPath: string): StripeEndpointRow {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const url = typeof r.url === "string" ? r.url : "";
  const host = hostOf(url);
  return {
    id: typeof r.id === "string" ? r.id : "",
    url,
    status: typeof r.status === "string" ? r.status : "",
    pointsAtThisApp: Boolean(url) && url.endsWith(webhookPath),
    // Compared, never assumed. Hardcoding this true is what makes a wrong-host
    // endpoint — the likeliest cause of the whole fault — invisible.
    hostServingThisRequest: Boolean(servingHost) && host === servingHost.trim().toLowerCase(),
    events: Array.isArray(r.enabled_events) ? r.enabled_events.length : 0,
  };
}

export function classifyEndpoints(input: {
  rows: unknown[];
  servingHost: string;
  webhookPath: string;
}): EndpointVerdict {
  const endpoints = input.rows.map((r) => endpointFromStripe(r, input.servingHost, input.webhookPath));
  const here = endpoints.filter((e) => e.pointsAtThisApp && e.hostServingThisRequest);
  const wrongHost = endpoints.filter((e) => e.pointsAtThisApp && !e.hostServingThisRequest);
  const servingUrl = input.servingHost ? `https://${input.servingHost}${input.webhookPath}` : `…${input.webhookPath}`;

  if (here.length === 1) {
    return {
      count: endpoints.length, endpoints, matching: 1, wrongHost: wrongHost.length, problem: "none",
      verdict: `Exactly one endpoint points at this app on this host (${here[0].id}). Its signing secret is the one STRIPE_WEBHOOK_SECRET must hold — open that endpoint in Stripe, reveal its secret, and compare. If deliveries still fail after that, the secret is simply the wrong one.`,
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
