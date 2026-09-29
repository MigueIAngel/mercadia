# Catalog service

NestJS + MongoDB (Mongoose). Owns products, variants and stock.

| | |
| --- | --- |
| Port | 4002 |
| Database | MongoDB `catalog` (Atlas M0 in the demo, Atlas Local in development) |
| Publishes | `product.published`, `product.updated`, `product.unpublished`, `product.price_changed`, `stock.reserved`, `stock.rejected`, `stock.released` |
| Consumes | `order.placed`, `order.cancelled`, `order.paid`, `store.opened`, `store.updated`, `review.created` |

## Highlights

- **Why MongoDB here:** products have free-form variants, options and specs that differ per
  category. Money and orders live in PostgreSQL in other services.
- **Atlas Search**: typo-tolerant search (`iphnoe` finds the iPhone), boosted titles and
  autocomplete. The service creates the index on boot and falls back to a `$text` index on
  plain MongoDB.
- **Faceted listing** in one `$facet` aggregation: results, total, brands, categories and
  price range.
- **Multi-currency**: prices are stored once in USD cents (IVA included) and converted to COP
  with a live rate (open.er-api.com, no key, refreshed twice a day, with a fallback).
  Sellers can price in COP or USD.
- **Stock reservations**: on `order.placed`, every line is decremented with a conditional
  update inside a **MongoDB transaction**, so the stock can't go negative and either all
  lines are reserved or none. Reservations are committed on `order.paid`, released on
  `order.cancelled`, and expire after 30 minutes if never paid.
- **Seller center** (create, edit, drafts, variants, stock), **admin moderation** (block and
  unblock), **signed Cloudinary uploads** (the browser uploads directly).
- Store names are a local read model, updated from identity events.

## Endpoints (main)

| Method | Path | |
| --- | --- | --- |
| GET | `/categories` | Category tree with counts (ES/EN) |
| GET | `/products?q&category&subcategory&store&brand&minPrice&maxPrice&onSale&inStock&sort&currency&page&limit` | Search |
| GET | `/products/suggest?q=` | Autocomplete |
| GET | `/products/:slug`, `/products/:slug/related` | Product page |
| GET/POST/PATCH | `/seller/products[/:id]` | Seller center |
| POST | `/seller/uploads/signature` | Cloudinary signed upload |
| GET/PATCH | `/admin/products[/:id]`, `/admin/catalog-stats` | Moderation |
| GET | `/currency/rates` | USD/COP rate |
| POST | `/internal/quote` | Checkout prices (service-to-service) |

## Development

```bash
npm run build -w @mercadia/catalog && npm start -w @mercadia/catalog
npm test -w @mercadia/catalog    # 15 e2e tests (MongoDB + Redis, test JWKS)
```
