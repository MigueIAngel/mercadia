# Engagement service

NestJS + MongoDB (Mongoose) + Socket.IO. Owns reviews and store reputation, buyer–seller chat,
notifications (in-app, real time and email) and the wishlist with price alerts.

|           |                                                                                                                                                                                                                                  |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Port      | 4006                                                                                                                                                                                                                             |
| Database  | MongoDB `engagement`                                                                                                                                                                                                             |
| Publishes | `review.created`                                                                                                                                                                                                                 |
| Consumes  | `user.registered`, `store.opened`, `store.updated`, `order.paid`, `order.cancelled`, `seller_order.status_changed`, `shipment.status_changed`, `refund.succeeded`, `dispute.opened`, `dispute.resolved`, `product.price_changed` |

## Highlights

- **Verified reviews only**: a buyer can review a product once, and only after the orders
  service confirms they received it. Rating summaries (average, count, 1–5 distribution) are
  one aggregation; catalog keeps its own denormalised rating from `review.created`.
- **Store reputation**: average rating, review count and the seller's reply rate. Sellers can
  answer each review once; helpful votes count once per user.
- **Real-time chat** over Socket.IO (path `/realtime/socket.io`, proxied by the gateway at
  `/api/realtime`). The socket authenticates with the same RS256 access token (JWKS), then
  joins `user:<id>` and, for sellers, `store:<storeId>`. One conversation per buyer, store and
  product, with unread counters on both sides.
- **Notifications** are produced from domain events: new sale, payment confirmed, shipment
  updates, refunds, disputes and wishlist price drops. Each one is stored, pushed to the open
  sockets and, when SMTP is configured, emailed with a bilingual template (Mailpit locally).
- **Wishlist price alerts**: the catalog price at save time is kept (read server-side, never
  trusted from the client); a `product.price_changed` below it notifies the user, and the
  wishlist shows the drop in the user's currency.

## Endpoints (main)

| Method          | Path                                                             |                                    |
| --------------- | ---------------------------------------------------------------- | ---------------------------------- |
| GET             | `/reviews/products/:productId?sort&page`                         | Reviews + rating summary           |
| GET             | `/reputation/stores/:storeId`                                    | Store reputation                   |
| POST            | `/reviews`, `/reviews/:id/helpful`, `/reviews/:id/reply`         | Write a review, vote, seller reply |
| GET             | `/seller/reviews`                                                | Reviews of the seller's store      |
| GET/POST        | `/conversations[?as=seller]`, `/conversations/:id[/messages]`    | Chat                               |
| GET/POST        | `/notifications`, `/notifications/unread`, `/notifications/read` | Notification centre                |
| GET/POST/DELETE | `/wishlist[?currency]`, `/wishlist/ids`, `/wishlist/:productId`  | Wishlist with price drops          |

## Development

```bash
npm run build -w @mercadia/engagement && npm start -w @mercadia/engagement
npm test -w @mercadia/engagement    # e2e tests (MongoDB + Redis, test JWKS, fake catalog/orders)
```

Set `SMTP_URL=smtp://localhost:1025` to send the emails to Mailpit.
