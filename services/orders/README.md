# Orders service

NestJS + PostgreSQL (Drizzle). Owns carts, checkout and the order lifecycle.

| | |
| --- | --- |
| Port | 4003 |
| Database | PostgreSQL `orders` |
| Publishes (outbox) | `order.placed`, `order.paid`, `order.cancelled`, `seller_order.status_changed` |
| Consumes | `stock.rejected`, `payment.succeeded`, `shipment.status_changed`, `refund.succeeded` |
| Calls | catalog (authoritative prices, stock, FX), fulfillment (shipping rates, flat-rate fallback) |

## Model

One checkout creates **one order** (one payment) split into **one seller order per store**:
each seller ships, is paid and can be disputed independently. Every seller order records the
marketplace **commission** (8 % by default) that payments retains from the payout.

```
cart ──checkout──▶ order (pending_payment) ──order.placed──▶ catalog reserves stock
                     │                                         ├─ stock.rejected ─▶ cancelled
                     │◀──────────── payment.succeeded ─────────┘
                     ▼
                   paid ─▶ seller orders: paid → processing → shipped → delivered ─▶ completed
                     └─ refund.succeeded ─▶ partially_refunded / refunded
```

- **Carts** work for guests (an anonymous id from the web app) and for accounts. The guest cart
  merges into the account cart at sign-in.
- Prices are **never taken from the client**: checkout re-quotes every line with the catalog,
  converts to the buyer's currency and splits IVA per category.
- The order, its seller orders, lines, history and `order.placed` are written in **one
  transaction** (outbox).
- Unpaid orders are cancelled after 30 minutes and the stock is released. A payment that arrives
  after the cancellation triggers a refund.
- 80 historical orders are seeded (shared with the other services through `demo-data`), so
  dashboards and verified-purchase reviews have data.

## Endpoints (main)

| Method | Path | |
| --- | --- | --- |
| GET/POST/PATCH/DELETE | `/cart`, `/cart/items[/:sku]`, `/cart/count` | Cart (header `x-cart-id` for guests) |
| POST | `/checkout/quote`, `/checkout` | Totals with shipping, place order |
| GET/POST | `/orders`, `/orders/:id`, `/orders/:id/cancel` | Buyer |
| GET/POST | `/seller/orders`, `/seller/orders/:id/accept`, `/seller/sales` | Seller |
| GET | `/admin/orders`, `/admin/orders/stats` | Admin (GMV, commission) |
| GET | `/internal/orders/:id`, `/internal/purchases` | Payments and reviews |

```bash
npm test -w @mercadia/orders   # 18 e2e tests (real Postgres, fake catalog and JWKS)
```
