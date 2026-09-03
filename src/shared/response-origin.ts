// WHICH MACHINE ANSWERED? — the question that ends the "Unexpected token '<'" hunt.
//
// THE EVIDENCE THAT FORCED THIS MODULE INTO EXISTENCE:
//
// Every one of the 177 API routes was built and served locally and probed with a
// GET and a POST. All 177 answered JSON. The five that did not are meant not to —
// two OAuth callbacks, two tracking pixels and the unsubscribe page. There is no
// route in this codebase that returns an HTML document to a caller expecting data.
//
// Yet production reports HTML on every screen. Both facts are true at once only if
// SOMETHING OTHER THAN THE APPLICATION IS ANSWERING. This deployment sits behind
// two of them:
//
//     browser → Cloudflare (edge) → Vercel (platform) → MarketWar OS (the app)
//
// Each of those three can return an HTML page, and to `JSON.parse` they are
// indistinguishable — all of them start `<!DOCTYPE`. They are, however, completely
// different faults with completely different fixes:
//
//   • Cloudflare answered      → the request NEVER REACHED the app. Nothing in
//                                this repository can cause it and nothing in this
//                                repository can fix it. It is a firewall rule, a
//                                bot-fight challenge, or an origin timeout.
//   • The Vercel platform      → the function was reached but never returned:
//     answered                   killed on a deadline, crashed at cold start, or
//                                the deployment is not there.
//   • The app answered         → our code rendered an error page. Ours to fix.
//
// The headers say which, unambiguously, and every one of them is readable from a
// same-origin fetch. This module reads them. It asserts nothing it cannot see:
// where the evidence is thin it says "unknown" rather than guessing, because a
// diagnostic that guesses is what produced three wrong theories already.
//
// Pure, and separate from the fetch wrapper that uses it, so the decision can be
// tested against every real header combination without a browser or a deployment.

/** Read a header by name, case-insensitively. `Headers` satisfies this as-is. */
export type HeaderLookup = { get(name: string): string | null };

export type Answerer = "cloudflare" | "vercel-platform" | "application" | "unknown";

export type Origin = {
  /** The machine that produced the response body. */
  answeredBy: Answerer;
  /** Did the request reach our code at all? `null` when the headers cannot say. */
  reachedTheApp: boolean | null;
  /** One sentence naming what happened, in the terms of what to do about it. */
  explanation: string;
  /** The single next step for the person reading it. */
  fix: string;
  /** The header values this conclusion rests on — so it can be checked, not trusted. */
  evidence: string[];
};

/**
 * Cloudflare's own origin-error codes. These are returned BY CLOUDFLARE, about
 * the origin — so seeing one means the app is unreachable or unhealthy from
 * Cloudflare's side, which is a different fault from the app erroring.
 */
const CF_ORIGIN_ERRORS: Record<number, string> = {
  520: "Cloudflare got an empty or malformed answer from the app",
  521: "Cloudflare could not connect to the app at all",
  522: "the connection from Cloudflare to the app timed out",
  523: "Cloudflare could not find a route to the app",
  524: "the app took longer than Cloudflare's 100-second limit to answer",
  525: "the TLS handshake between Cloudflare and the app failed",
  526: "the app's certificate could not be validated by Cloudflare",
};

/**
 * Vercel's platform error codes, in the terms of what causes them. Vercel sets
 * `x-vercel-error` on responses IT generates — never on ones our code returns —
 * so its presence alone proves the function did not answer.
 */
const VERCEL_ERRORS: Record<string, { what: string; fix: string }> = {
  FUNCTION_INVOCATION_FAILED: {
    what: "the serverless function crashed before it could answer",
    fix: "Open the deployment's Runtime Logs on Vercel and read the top entry — it carries the exact throw. A crash this early is almost always a module failing to load, which no handler-level guard can catch.",
  },
  FUNCTION_INVOCATION_TIMEOUT: {
    what: "the function ran past its time limit and the platform killed it",
    fix: "Raise `maxDuration` on that route, or lower the work it does. Nothing was charged for work that did not finish.",
  },
  FUNCTION_PAYLOAD_TOO_LARGE: {
    what: "the request or the answer was bigger than the platform allows",
    fix: "Send less in one call — split the batch, or upload the file rather than inlining it.",
  },
  FUNCTION_THROTTLED: {
    what: "the platform throttled this deployment",
    fix: "Check the Vercel dashboard for a usage limit on the account.",
  },
  EDGE_FUNCTION_INVOCATION_FAILED: {
    what: "the middleware crashed before the route was reached",
    fix: "Read the Edge Logs on Vercel. Because middleware runs before EVERY request, a fault here breaks the whole site at once rather than one screen.",
  },
  EDGE_FUNCTION_INVOCATION_TIMEOUT: {
    what: "the middleware ran past its time limit",
    fix: "The human gate is the only work middleware does; check Edge Logs for what blocked it.",
  },
  DEPLOYMENT_NOT_FOUND: {
    what: "there is no deployment at this address",
    fix: "The domain points somewhere that no longer exists. Re-point it at the current production deployment in the Vercel project's Domains settings.",
  },
  DEPLOYMENT_PAUSED: {
    what: "this deployment is paused",
    fix: "Resume it in the Vercel dashboard.",
  },
  DEPLOYMENT_DISABLED: {
    what: "this deployment is disabled",
    fix: "Re-enable it in the Vercel dashboard.",
  },
  NOT_FOUND: {
    what: "the platform has no route at that address",
    fix: "The address is wrong, or the build did not include that route. Check the build output for it.",
  },
  ROUTER_CANNOT_MATCH: {
    what: "no route matched the address",
    fix: "Check the address against the build output's route list.",
  },
  MIDDLEWARE_INVOCATION_FAILED: {
    what: "the middleware crashed before the route was reached",
    fix: "Read the Edge Logs on Vercel. A fault here breaks every screen at once.",
  },
};

/** Text that a page can only be showing if a particular machine wrote it. */
function fromBody(body: string): { answeredBy: Answerer; explanation: string; fix: string } | null {
  const t = body.toLowerCase();
  if (t.includes("just a moment") || t.includes("checking your browser") || t.includes("attention required") || t.includes("cloudflare ray id")) {
    return {
      answeredBy: "cloudflare",
      explanation: "Cloudflare showed a bot challenge instead of passing the request through, so it never reached MarketWar OS.",
      fix: "In Cloudflare → Security, turn OFF Bot Fight Mode for this zone, or add a rule that skips every check for /api/*. A challenge is an HTML page, and a page cannot be an answer to a data request — which is why the screen shows a parse error rather than a captcha.",
    };
  }
  if (t.includes("authentication required") && t.includes("vercel")) {
    return {
      answeredBy: "vercel-platform",
      explanation: "Vercel's Deployment Protection is on, so it demands a Vercel login before any request reaches the app — including the app's own calls to itself.",
      fix: "Vercel → Project → Settings → Deployment Protection, and set Vercel Authentication to Disabled (or Standard Protection, which exempts production).",
    };
  }
  if (t.includes("application error") && t.includes("server-side exception")) {
    return {
      answeredBy: "application",
      explanation: "MarketWar OS itself threw while rendering, and Next showed its own error page in place of an answer.",
      fix: "This is ours. The Vercel Runtime Logs carry the digest and the stack.",
    };
  }
  return null;
}

/**
 * Name the machine that produced a response, from its headers and, failing those,
 * from what the page says.
 *
 * `body` is the tag-stripped text of the response, or "" when there is none. It is
 * only consulted where the headers are silent, because a header cannot be faked by
 * a page that merely mentions a word.
 */
export function whoAnswered(status: number, headers: HeaderLookup, body = ""): Origin {
  const h = (n: string) => (headers.get(n) || "").trim();
  const cfRay = h("cf-ray");
  const cfMitigated = h("cf-mitigated");
  const vercelId = h("x-vercel-id");
  const vercelError = h("x-vercel-error");
  const server = h("server").toLowerCase();

  const evidence: string[] = [];
  if (cfRay) evidence.push(`cf-ray: ${cfRay}`);
  if (cfMitigated) evidence.push(`cf-mitigated: ${cfMitigated}`);
  if (server) evidence.push(`server: ${server}`);
  if (vercelId) evidence.push(`x-vercel-id: ${vercelId}`);
  if (vercelError) evidence.push(`x-vercel-error: ${vercelError}`);
  if (!evidence.length) evidence.push("no identifying headers on the response");

  // 1. Cloudflare says outright that it intervened. Nothing else can set this.
  if (cfMitigated) {
    return {
      answeredBy: "cloudflare",
      reachedTheApp: false,
      explanation: `Cloudflare stopped this request itself (${cfMitigated}) — it never reached MarketWar OS.`,
      fix: "In Cloudflare → Security, exempt /api/* from Bot Fight Mode and any managed challenge. Browser-side calls carry no browser chrome, so a challenge aimed at bots lands on the app's own requests.",
      evidence,
    };
  }

  // 2. A Cloudflare origin-error code. Cloudflare's opinion of the app, not the
  //    app's answer — and the two need opposite fixes.
  if (cfRay && CF_ORIGIN_ERRORS[status]) {
    return {
      answeredBy: "cloudflare",
      reachedTheApp: status === 524 || status === 520,
      explanation: `Cloudflare answered ${status}: ${CF_ORIGIN_ERRORS[status]}.`,
      fix: status === 524
        ? "The route needs to answer inside 100 seconds. Either shorten the work or move it to a job the page polls."
        : "This is a connection between Cloudflare and Vercel, not anything in the application. Check the Cloudflare DNS record for this host is proxied and points at the Vercel target, and that SSL/TLS mode is Full (strict).",
      evidence,
    };
  }

  // 3. Vercel names its own failures. This header is never present on a response
  //    our code produced, so it is proof the function did not answer.
  if (vercelError) {
    const known = VERCEL_ERRORS[vercelError];
    return {
      answeredBy: "vercel-platform",
      reachedTheApp: vercelError.startsWith("FUNCTION_") || vercelError.startsWith("EDGE_") || vercelError.startsWith("MIDDLEWARE_"),
      explanation: known
        ? `Vercel answered instead of the app: ${known.what} (${vercelError}).`
        : `Vercel answered instead of the app (${vercelError}).`,
      fix: known ? known.fix : "Look this code up in the Vercel error reference and read the deployment's logs.",
      evidence,
    };
  }

  // 4. Cloudflare touched it and Vercel never did. The clearest signal there is:
  //    the request stopped at the edge.
  if (cfRay && !vercelId) {
    const fromText = fromBody(body);
    return {
      answeredBy: "cloudflare",
      reachedTheApp: false,
      explanation: fromText?.explanation
        ?? `Cloudflare answered this (HTTP ${status}) and the request never reached Vercel — there is no x-vercel-id on the response.`,
      fix: fromText?.fix
        ?? "Nothing in MarketWar OS can cause or cure this. Check Cloudflare → Security Events for this host and look for a rule matching /api/*, then exempt it.",
      evidence,
    };
  }

  // 5. The request reached the app and the app answered. Ours.
  if (vercelId) {
    const fromText = fromBody(body);
    return {
      answeredBy: fromText?.answeredBy ?? "application",
      reachedTheApp: true,
      explanation: fromText?.explanation
        ?? `MarketWar OS answered HTTP ${status} with something other than data.`,
      fix: fromText?.fix
        ?? "This one is ours. The Vercel Runtime Logs for this deployment carry the cause.",
      evidence,
    };
  }

  // 6. Nothing identifiable. Say so, rather than inventing a culprit.
  const fromText = fromBody(body);
  if (fromText) return { ...fromText, reachedTheApp: fromText.answeredBy === "application", evidence };
  return {
    answeredBy: "unknown",
    reachedTheApp: null,
    explanation: `Something answered HTTP ${status} with something other than data, and it carried no header naming which machine it was.`,
    fix: "Open the browser's Network tab, select this request and copy its Response Headers — `cf-ray` means Cloudflare handled it, `x-vercel-id` means it reached Vercel, and which of those is present decides where the fault is.",
    evidence,
  };
}
