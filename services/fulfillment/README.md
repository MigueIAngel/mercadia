# Fulfillment service

NestJS + PostgreSQL (Drizzle). Everything after payment: addresses, shipping prices,
shipments with tracking, and returns and disputes.

| | |
| --- | --- |
| Port | 4005 |
| Database | PostgreSQL `fulfillment` |
| Publishes (outbox) | `shipment.status_changed`, `dispute.opened`, `dispute.resolved` |
| Consumes | `seller_order.status_changed` (local read model of seller orders) |

## Shipping rates

Priced by Colombian **region** (Andina, Caribe, Pacífico, remote areas) between the store's
city and the destination: local $2.50 · same region $4 · national $6 · remote $10 (+$1 per
extra kg). Orders of $60 or more per store ship free, except to remote areas. Checkout gets
these through `POST /internal/rates`; orders falls back to a flat rate if this service is down.

## Shipments

The seller prints a label (`POST /seller/shipments`) and a **simulated carrier** moves the
parcel through `label_created → in_transit → out_for_delivery → delivered`. The step length is
configurable (`TRACKING_STEP_SECONDS`) so the demo moves in minutes. Each step publishes
`shipment.status_changed`:

- orders marks the seller order shipped or delivered and completes the order;
- payments **releases the seller's escrow** on delivery;
- engagement notifies the buyer.

`GET /shipments/track/:number` is a public tracking page without personal data.

## Returns and disputes

1. The buyer opens a case for a shipped or delivered seller order (within 30 days of
   delivery, one open case at a time). The amount is capped at what is still refundable.
2. The seller answers within 72 h. **Accepting** resolves it with a refund; **rejecting** lets
   the buyer escalate. If the seller does not answer in time, the case escalates automatically.
3. An **admin** decides: full refund, partial refund or rejection.
4. `dispute.resolved` makes payments refund the buyer, taking the money from the seller's held
   funds first.

Both parties and the admin share a message thread per case.

```bash
npm test -w @mercadia/fulfillment   # 18 tests (rates, addresses, carrier simulation, disputes)
```
