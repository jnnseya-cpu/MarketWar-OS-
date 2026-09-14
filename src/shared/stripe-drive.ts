// MAKE STRIPE PROVE THE MONEY PATH, INSTEAD OF ASKING THE OWNER TO CLICK.
//
// WHY THIS EXISTS. The `stripe-webhook-never-verified` blocker ends with a fix
// that reads "…then use Stripe's 'Send test webhook' on it." That sentence is
// the thing this repository has a standing rule against: **never tell the owner
// to do by hand what the platform should do for them.** When the answer is "go
// and click", the defect is that nothing is clicking.
//
// It is also the last thing standing between "proven in parts" and "proven end
// to end", and it does NOT need a customer, a card or a browser. Stripe emits
// real events for things the API can cause, and it delivers them over the real
// internet to the real endpoint with a real signature. Cause one, then read back
// whether it verified. That is the whole loop, minus only the part where a human
// types a card number.
//
// WHAT THIS FILE DECIDES, AND WHY IT IS PURE.
//
// Every interesting branch here depends on a populated Stripe account, which
// only a real key produces — and this codebase has already paid for that once:
// `probeTargets` was inline in a route, was mutated open, and NOTHING FAILED,
// because the test container has no key and the branch never ran. A branch that
// can only run in production is a branch nobody has ever run. So the decisions
// live here, where a test can put any account shape in front of them.
//
// THE RULE THAT OUTRANKS EVERY OTHER RULE IN THIS FILE.
//
// **A LIVE KEY NEVER CAUSES A CHARGEABLE OBJECT.** In test mode an invoice is a
// toy. On a live account the same three API calls create a real invoice against
// a real customer, and — depending on the account's settings — can email it. A
// diagnostic that bills somebody is not a diagnostic. So the live path is
// restricted to objects that move no money at all, and if the endpoint is not
// subscribed to those, the honest answer is that this cannot be proved without a
// payment, said plainly, rather than a clever workaround nobody audited.

/** What kind of key we are holding. `unknown` is a restricted key that will not say. */
export type KeyMode = "live" | "test" | "unknown" | "none";

/**
 * Read the mode off the key. Standard (`sk_`) and restricted (`rk_`) both.
 *
 * ONE DEFINITION. `/api/health/stripe` computed this inline with the same
 * regexes; a second copy of "is this key live" is the kind of duplication that
 * ends with one of them being updated.
 */
export function stripeKeyMode(secret: string | undefined): KeyMode {
  const s = (secret || "").trim();
  if (!s) return "none";
  if (/^(sk|rk)_live/.test(s)) return "live";
  if (/^(sk|rk)_test/.test(s)) return "test";
  return "unknown";
}

/**
 * Is it safe to create a billable object with this key?
 *
 * ONLY an explicitly recognised test key. A restricted key that will not reveal
 * its mode is treated as LIVE, because the failure modes are not symmetrical:
 * refusing on a test key costs a diagnostic, and proceeding on a live key
 * invoices a stranger.
 */
export function mayCreateBillableObjects(mode: KeyMode): boolean {
  return mode === "test";
}

export type Provocation = {
  /** What to do to make Stripe emit an event. `null` when nothing safe is available. */
  kind: "invoice" | "customer" | null;
  /** The event type we expect Stripe to deliver. */
  eventType: string;
  /** TRUE when the provoked event also exercises the wallet credit, not just the signature. */
  exercisesWallet: boolean;
  /** Why this one, in one sentence, including why not the better one. */
  why: string;
  /** Present only when `kind` is null: what stops it, and what would unblock it. */
  blocker: string;
};

/** Does this endpoint's subscription list cover `type`? `["*"]` is Stripe's everything. */
export function endpointDelivers(enabledEvents: readonly string[], type: string): boolean {
  return enabledEvents.includes("*") || enabledEvents.includes(type);
}

/**
 * WHAT CAN THIS DEPLOYMENT SAFELY MAKE STRIPE DO?
 *
 * Preference order, and the order is the whole argument:
 *
 *  1. **A paid invoice, test mode only.** The only provocation that exercises the
 *     WHOLE loop — signature, dispatcher, wallet credit, ledger row — because it
 *     is the event a renewal actually arrives as. It costs nothing in test mode
 *     and is forbidden outright anywhere else.
 *  2. **A customer created and deleted.** Free on any account, live included,
 *     and it proves the two things the blocker is actually about: Stripe can
 *     reach us, and the secret we hold verifies what Stripe signs. It proves
 *     NOTHING about the wallet, and says so rather than implying otherwise.
 *  3. **Nothing.** When the endpoint subscribes to neither, no amount of API
 *     access helps: Stripe only delivers what the endpoint asked for, so an
 *     unsubscribed event is not a failed delivery, it is no delivery.
 */
export function chooseProvocation(input: {
  mode: KeyMode;
  /** The endpoint's `enabled_events`, exactly as Stripe returned them. */
  enabledEvents: readonly string[];
}): Provocation {
  const { mode, enabledEvents } = input;

  if (mode === "none") {
    return {
      kind: null, eventType: "", exercisesWallet: false, why: "",
      blocker: "No STRIPE_SECRET_KEY, so nothing can be asked of Stripe at all. This is the demo-mode "
        + "answer, not a fault — but it means the money path is unproven here and must not be reported otherwise.",
    };
  }

  const canBill = mayCreateBillableObjects(mode);
  const invoiceSubscribed = endpointDelivers(enabledEvents, "invoice.paid");
  const customerSubscribed = endpointDelivers(enabledEvents, "customer.created");

  if (canBill && invoiceSubscribed) {
    return {
      kind: "invoice", eventType: "invoice.paid", exercisesWallet: true,
      why: "A test-mode invoice, paid with a test card, makes Stripe emit and deliver a real `invoice.paid` — "
        + "the same event a renewal arrives as. It exercises the entire loop: Stripe's own delivery, the "
        + "signature, the dispatcher, the wallet credit and the ledger row. No real money exists in test mode.",
      blocker: "",
    };
  }

  if (customerSubscribed) {
    return {
      kind: "customer", eventType: "customer.created", exercisesWallet: false,
      why: canBill
        ? "This endpoint is not subscribed to `invoice.paid`, so a paid invoice would emit an event Stripe never "
          + "delivers here. Creating and deleting a customer is free and IS delivered, which proves Stripe can "
          + "reach us and that the secret verifies — but nothing about the wallet, because no money moves."
        : `This is a ${mode === "live" ? "LIVE" : "restricted, therefore assumed live"} key, so no billable object `
          + "will be created under any circumstances — a diagnostic that invoices somebody is not a diagnostic. "
          + "Creating and deleting a customer moves no money and still makes Stripe deliver a real, signed event, "
          + "which proves reachability and the signing secret. It proves nothing about the wallet credit; only a "
          + "real payment does that.",
      blocker: "",
    };
  }

  return {
    kind: null, eventType: "", exercisesWallet: false, why: "",
    blocker: `This endpoint subscribes to neither \`invoice.paid\` nor \`customer.created\`, and Stripe delivers only `
      + `what an endpoint asks for — so there is no event this deployment can cause that would arrive. Add `
      + `\`customer.created\` to the endpoint in Stripe (it moves no money and can be removed afterwards) and run `
      + `this again. Subscribed today: ${enabledEvents.length ? enabledEvents.slice(0, 12).join(", ") : "nothing"}.`,
  };
}

export type ReceiptLike = { lastVerifiedAt: string | null; verifiedCount: number };

/**
 * What the deployment recorded THIS event doing to a wallet, read back by id.
 *
 * `null` means nothing was recorded — which is NOT the same as nothing happening,
 * and the verdict says so rather than choosing one.
 */
export type WalletOutcome = { orgId: string; creditedAcu: number; planId: string | null } | null;

export type DriveVerdict = {
  /** TRUE only when a delivery Stripe itself made verified against our secret. */
  proven: boolean;
  /** TRUE when the wallet also moved — a strictly stronger claim, never implied by `proven`. */
  walletProven: boolean;
  outcome: "verified" | "not_delivered" | "delivered_not_verified" | "not_attempted";
  verdict: string;
  /** What to do about it. Empty when there is nothing to do. */
  fix: string;
};

/**
 * DID IT LAND — and if not, WHICH of the three failures was it?
 *
 * The three are indistinguishable from the symptom and have completely different
 * fixes, which is the wrong-remedy defect this repository keeps paying for:
 *
 *   • Stripe never got the event out (endpoint unreachable, DNS, TLS) — Stripe's
 *     own `pending_webhooks` stays above zero and no receipt moves.
 *   • Stripe delivered and our route refused it — the receipt does not move
 *     either, but `pending_webhooks` drains, because Stripe stops retrying once
 *     it has exhausted them. The distinguishing fact is that the route was
 *     reached at all, which only the endpoint's own delivery log knows.
 *   • It worked.
 *
 * The one thing this must never do is call an unverified delivery "probably
 * fine". The blocker it exists to clear is specifically about a secret that
 * passes every shape check and fails every delivery.
 */
export function driveVerdict(input: {
  provocation: Provocation;
  /** Whether Stripe confirmed it created the event we asked for. */
  eventId: string | null;
  /** Stripe's own count of endpoints that have not yet accepted this event. */
  pendingWebhooks: number | null;
  before: ReceiptLike;
  after: ReceiptLike;
  /**
   * What the deployment recorded this event doing to a wallet. MEASURED, never
   * inferred — see the comment on `walletProven` below for what that cost.
   */
  walletOutcome?: WalletOutcome;
  /**
   * Did a signed delivery to this deployment's own webhook address answer 2xx?
   *
   * THE ONE FACT THAT SEPARATES the two causes of a failed delivery, which
   * otherwise produce an identical symptom and have opposite fixes. `null` when
   * it could not be asked — and then neither cause is asserted.
   */
  endpointReachable?: boolean | null;
  /** TRUE when the key's mode and the configured endpoint's mode cannot match. */
  modeMismatch?: boolean;
}): DriveVerdict {
  const { provocation, eventId, pendingWebhooks, before, after } = input;
  const wallet = input.walletOutcome ?? null;

  if (!provocation.kind) {
    return {
      proven: false, walletProven: false, outcome: "not_attempted",
      verdict: "Nothing was attempted, so nothing is proven — and that is the report, not a pass.",
      fix: provocation.blocker,
    };
  }
  if (!eventId) {
    return {
      proven: false, walletProven: false, outcome: "not_attempted",
      verdict: "Stripe accepted the request but no event id came back, so there is nothing to follow. "
        + "The provocation did not happen; the webhook is not implicated either way.",
      fix: "Re-run with the API responses visible. A restricted key missing a write permission fails here.",
    };
  }

  const moved = after.verifiedCount > before.verifiedCount
    || (after.lastVerifiedAt !== null && after.lastVerifiedAt !== before.lastVerifiedAt);

  if (moved) {
    // MEASURED, NOT INFERRED — and this line is the defect I shipped and caught
    // by driving it. It read `walletProven: provocation.exercisesWallet`, which
    // is a claim about the event TYPE, not about the wallet. The receipt moves
    // on signature verification, before anything downstream can fail, so a
    // delivery that verified and then credited nothing produced exactly the same
    // green tick. The whole point of this run is the money path; asserting the
    // money path from an intention is the second defect class sitting on it.
    //
    // `processed_events` is written in the SAME TRANSACTION as the credit, so
    // its existence with a positive amount is the one fact that cannot be true
    // unless the wallet moved. Nothing else is accepted as proof.
    const walletProven = provocation.exercisesWallet && wallet !== null && wallet.creditedAcu > 0;
    return {
      proven: true,
      walletProven,
      outcome: "verified",
      verdict: walletProven
        ? `PROVEN END TO END. Stripe generated a real ${provocation.eventType}, delivered it over the internet to `
          + "this deployment, the signature verified against the secret this deployment holds, and "
          + `${wallet!.creditedAcu} ACUs landed in wallet ${wallet!.orgId} — read back from the record written in the `
          + "same transaction as the credit, so it cannot exist unless the money became credit. The only thing "
          + "untested is a human typing a card number."
        : provocation.exercisesWallet
          ? `HALF PROVEN, AND THE HALF THAT MATTERS IS THE MISSING ONE. Stripe generated a real `
            + `${provocation.eventType} and the signature verified here — so Stripe reaches us and the secret is `
            + "right. But no wallet outcome was recorded for that event, so the credit is NOT proven: the delivery "
            + "verified and then something downstream did nothing. A payment that is accepted and credits nothing is "
            + "the 'charged and served nothing' state, and it must never be reported as a working money path."
          : `PROVEN AS FAR AS IT GOES. Stripe generated a real ${provocation.eventType}, delivered it, and the `
            + "signature verified against the secret this deployment holds — so the endpoint URL is right, the "
            + "endpoint is reachable, and STRIPE_WEBHOOK_SECRET belongs to it. The wallet credit is NOT proven by "
            + "this, because no money moved; a paid invoice in test mode, or the first real payment, proves that.",
      fix: walletProven || !provocation.exercisesWallet
        ? ""
        : "Post the same event shape at /api/webhooks/stripe and read `walletApplied` in the response — it names the "
          + "reason. The usual one is an event that does not name its plan or its org, which the dispatcher refuses "
          + "on purpose rather than guessing an entitlement. On a deployment with no Firebase Admin there is no "
          + "durable wallet at all, and the route answers 500 so Stripe redelivers.",
    };
  }

  if (input.modeMismatch) {
    return {
      proven: false, walletProven: false, outcome: "delivered_not_verified",
      verdict: "Stripe created the event and this deployment did not record a verified delivery — and the likeliest "
        + "reason is not a fault at all: test-mode and live-mode webhook endpoints are SEPARATE objects with "
        + "SEPARATE signing secrets. Driving a test key at a deployment holding the live endpoint's secret fails "
        + "every signature, exactly as a wrong secret would.",
      fix: "Either point STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET at the same mode, or add a test-mode endpoint "
        + "and drive that. This result is not evidence about the live path either way.",
    };
  }

  const SECRET_FIX = "This account has several webhook endpoints and each has its own signing secret. Open the endpoint "
    + "whose URL matches this deployment, reveal ITS secret, and put that in STRIPE_WEBHOOK_SECRET. Stripe returns "
    + "signing secrets only on creation, so no diagnostic can make this comparison for you.";
  const REACH_FIX = "Open /api/health/stripe and read `selfDelivery`: it posts a correctly signed delivery to each "
    + "candidate address exactly as Stripe does, redirects unfollowed, and names whichever one answers 2xx. Point the "
    + "endpoint at that address.";

  if (pendingWebhooks !== null && pendingWebhooks > 0) {
    // AN OUTSTANDING ATTEMPT DOES NOT NAME ITS CAUSE, AND SAYING IT DOES WAS A
    // DEFECT IN THIS FILE. It read "Stripe cannot complete an exchange — DNS,
    // TLS, or a redirect", and driving a deliberately WRONG SIGNING SECRET
    // produced exactly this state and exactly that sentence: the delivery
    // arrived, our route answered 400, and Stripe counts a 400 as a failed
    // attempt just as it counts a connection that never opened. Sending somebody
    // to check DNS for a secret they pasted from the wrong endpoint is the
    // wrong-remedy defect this repository keeps paying for.
    //
    // Two causes, one symptom. What separates them is whether the address is
    // REACHABLE at all, which `selfDelivery` answers — so it is asked, and when
    // the answer is not available the verdict carries both remedies in order
    // rather than picking the one that sounds likeliest.
    if (input.endpointReachable === true) {
      return {
        proven: false, walletProven: false, outcome: "delivered_not_verified",
        verdict: `Stripe has ${pendingWebhooks} delivery attempt(s) outstanding and nothing here recorded a verified `
          + "delivery — but a signed delivery to this deployment's own webhook address DID answer 2xx, so the address "
          + "is reachable and the route is alive. A reachable endpoint that refuses Stripe's delivery is refusing the "
          + "SIGNATURE: the secret this deployment holds is not the secret Stripe signed with. (The reachability "
          + "probe starts inside this deployment, so it proves the route answers, not that Stripe's network can get "
          + "to it — if the secret checks out, reachability is the next thing to doubt.)",
        fix: SECRET_FIX,
      };
    }
    if (input.endpointReachable === false) {
      return {
        proven: false, walletProven: false, outcome: "not_delivered",
        verdict: `Stripe has ${pendingWebhooks} delivery attempt(s) outstanding, nothing here recorded a verified `
          + "delivery, and a signed delivery to this deployment's own webhook address did NOT answer 2xx either. The "
          + "address itself is the fault — a name that does not resolve, TLS that does not answer, or a host that "
          + "redirects rather than replies, which Stripe records as an error because it does not follow redirects.",
        fix: REACH_FIX,
      };
    }
    return {
      proven: false, walletProven: false, outcome: "not_delivered",
      verdict: `Stripe created the event, has ${pendingWebhooks} delivery attempt(s) outstanding on it, and nothing `
        + "here recorded a verified delivery. TWO different faults produce exactly this and nothing available from "
        + "here separates them: Stripe never completed an exchange with the address (DNS, TLS, or a redirect it will "
        + "not follow), OR it delivered and this deployment refused the signature — a 400 counts as a failed attempt "
        + "just as a connection that never opened does. They have opposite fixes, so neither is asserted.",
      fix: `In this order. FIRST, reachability: ${REACH_FIX} If the address answers, the address is not the fault. `
        + `THEN the secret: ${SECRET_FIX}`,
    };
  }

  return {
    proven: false, walletProven: false, outcome: "delivered_not_verified",
    verdict: "Stripe created the event and has no delivery attempts outstanding on it, yet nothing here recorded a "
      + "verified delivery. Stripe clears an attempt when the endpoint answers 2xx, so something accepted this event "
      + "— just not this deployment. Either the event went to a different endpoint on the account, or this "
      + "deployment answered 2xx without the signature ever verifying, which it has no path to do.",
    fix: `Check which endpoints this account holds and which one the event was addressed to. If it was this one: ${SECRET_FIX}`,
  };
}
