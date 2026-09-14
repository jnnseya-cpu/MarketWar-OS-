# Prove the money path — one command, no card, no clicking

`npm run drive:commerce`

That is the whole runbook. The rest of this file is what it does, what it
refuses to do, and how to read the answer.

## What question it answers

Two facts decide whether MarketWar can take money, and **nothing inside the
application can establish either of them**:

1. Can Stripe reach this deployment at all?
2. Is `STRIPE_WEBHOOK_SECRET` the secret Stripe actually signs with?

Every other check reasons from inside the process, which is the one vantage
point that cannot see an endpoint Stripe never reaches. `drive:loop` signs and
posts its own delivery — that proves the route, the dispatcher and the wallet,
and it cannot prove either fact above, because it is not Stripe.

So this makes **Stripe** emit a real event and deliver it over the real
internet, then reads back whether it verified.

It replaces an instruction that used to end "…then use Stripe's *Send test
webhook* on it." A person, a browser, a button. This repository has a standing
rule against exactly that: **never tell the owner to do by hand what the
platform should do for them.** When the answer is "go and click", the defect is
that nothing is clicking.

## Running it

Against a local production build:

```bash
npm run build
STRIPE_SECRET_KEY=sk_test_… STRIPE_WEBHOOK_SECRET=whsec_… CRON_SECRET=… npm run start &
STRIPE_SECRET_KEY=sk_test_… CRON_SECRET=… npm run drive:commerce
```

Against the live deployment:

```bash
BASE_URL=https://marketwaros.com \
STRIPE_SECRET_KEY=sk_… \
CRON_SECRET=… \
npm run drive:commerce
```

`CRON_SECRET` is not optional in practice. The delivery receipt and the wallet
outcome are privileged reads — they name an org and an amount of money — and
without the bearer the run can provoke the event but cannot read back whether it
landed, which is the only part that matters. It says so rather than guessing.

## What it will not do

**A live key never creates a billable object.** In test mode an invoice is a
toy; on a live account the identical three API calls invoice a real customer and
may email them. A diagnostic that bills somebody is not a diagnostic.

A restricted key (`rk_…`) that will not reveal its mode is treated as **live**,
because the two mistakes are not symmetrical: refusing on a test key costs a
diagnostic, and proceeding on a live key invoices a stranger.

It also deletes everything it creates, which voids the invoice with the
customer. A diagnostic that leaves debris in somebody's Stripe account is one
they stop running.

## What each verdict means

| Verdict | What is proven | What is not |
|---|---|---|
| **PROVEN END TO END** | Stripe emitted a real `invoice.paid`, delivered it, the signature verified here, and the ACUs are in the wallet — read back from `processed_events`, written in the same transaction as the credit. | A human typing a card number into the hosted page. |
| **PROVEN AS FAR AS IT GOES** | Stripe reached us and the secret is right. Available on a live key, because the provocation moves no money. | The wallet credit. Only a paid invoice or a real payment proves that. |
| **HALF PROVEN** | The delivery verified. | The credit — and this is the "charged and served nothing" state. The run names the next step. |
| **Two faults, neither asserted** | Stripe created the event and it did not land. | Which of the two causes it is. They have opposite fixes, so the run gives both, in order, rather than picking one. |
| **Nothing was attempted** | Nothing. | Everything. Usually the endpoint subscribes to neither event, and Stripe delivers only what an endpoint asked for. |

## The two things this run found in itself

Both are the same defect class — a check that passes, or fails, for a reason
unrelated to what it tests — and both were found by driving it rather than
reading it.

**It claimed the wallet from the event type.** `walletProven` was set from "this
kind of event carries money". The receipt it read moves on *signature
verification*, before anything downstream can fail, so a delivery that verified
and then credited nothing produced an identical green tick — on the money path,
which is the entire point of the exercise. It now reads `processed_events` by
Stripe's own event id: that record is written in the same transaction as the
credit, so it cannot exist unless the wallet moved.

**It blamed DNS for a wrong signing secret.** An outstanding delivery attempt was
read as "Stripe could not reach the address". Driving a deliberately wrong secret
produced exactly that state — the delivery arrived, the route answered 400, and
Stripe leaves a 400 outstanding just as it leaves a connection that never
opened — and the run sent the operator to check DNS. The discrimination is
whether the address is reachable, which `selfDelivery` answers; and the
reachability answer is now only accepted **for the same address Stripe used**,
because `selfDelivery` probes `https://` addresses only and was answering about
an address Stripe never touched.

## Exercising it without a Stripe account

`tests/helpers/fake-stripe.mjs` is a stand-in that **really signs and really
delivers** — it POSTs to the endpoint itself over HTTP, so the driver never
touches a signature, which is the entire point. It delivers only what the
endpoint subscribes to, leaves an attempt outstanding when the endpoint does not
answer 2xx, and can be told to sign with the wrong secret.

Nothing MarketWar owns is stood in for: the webhook route, the signature check,
the dispatcher, the wallet and the receipt all run for real, over a real socket.
What is replaced is the one participant a container cannot have — somebody
else's payment processor.

The three scenarios driven against a real running server and a real Firestore:

- **healthy** — 8 proven, 0 broken; 980 ACUs read back out of the wallet.
- **wrong signing secret** — 6 proven, 2 broken; the run refuses to assert a
  cause it cannot separate and gives both remedies in order.
- **endpoint subscribed to neither event** — 2 proven, 2 not exercisable, 0
  broken, exit 0. Not a failure: there is nothing to deliver.
