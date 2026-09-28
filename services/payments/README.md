# Payments service

NestJS + PostgreSQL (Drizzle). Takes the buyer's money once per order and pays each seller
after delivery.

| | |
| --- | --- |
| Port | 4004 |
| Database | PostgreSQL `payments` |
| Processor | **Stripe** (test mode, Connect Express) when `STRIPE_SECRET_KEY=sk_test_…` is set, otherwise a **simulated processor** |
| Publishes | `payment.succeeded`, `payment.failed`, `refund.succeeded` (outbox), `store.payouts_enabled` |
| Consumes | `order.cancelled`, `dispute.resolved`, `seller_order.status_changed` |

## Money flow

1. `POST /payments/intents` creates a Stripe PaymentIntent for the order total (or a simulated
   intent). The web app confirms it with Stripe Elements, or with the test form in simulated mode.
2. On success (Stripe webhook `payment_intent.succeeded`, signature-verified and deduplicated)
   each seller's share **minus the 8 % commission** is recorded as a **held transfer**: escrow.
3. When a seller's shipment is **delivered**, their transfer is released: a Stripe `Transfer`
   to their Connect account, grouped by `transfer_group = orderId` (separate charges and
   transfers).
4. **Refunds**: a cancelled paid order refunds everything that is left; a resolved dispute
   refunds its amount. Refunds are idempotent (keyed by dispute or cancellation) and taken from
   the seller's held share first.

## Simulated processor

The demo runs without Stripe credentials, using Stripe's own test numbers:

| Card | Result |
| --- | --- |
| `4242 4242 4242 4242` | Approved (Visa) |
| `5555 5555 5555 4444` | Approved (Mastercard) |
| `4000 0000 0000 0002` | `card_declined` |
| `4000 0000 0000 9995` | `insufficient_funds` |

Numbers are validated with Luhn, expiry and CVC checks; only the last 4 digits are stored.

```bash
npm test -w @mercadia/payments   # 12 tests (escrow, release, refunds, idempotency, test cards)
```
