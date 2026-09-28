# AI service

Python 3.13 + FastAPI. Shopping assistant with Gemini function calling, semantic search with
MongoDB Atlas Vector Search, recommendations and a copywriter for sellers.

| | |
| --- | --- |
| Port | 8000 |
| Database | MongoDB `ai` (product vectors only; product data stays in catalog) |
| Consumes | `product.published`, `product.updated`, `product.unpublished`, `product.price_changed` |
| Calls | catalog (export, prices), orders and engagement (with the user's own token), fulfillment (tracking) |

## Highlights

- **Assistant as an agent**: Gemini decides which tools to call (`search_products`,
  `get_product_details`, `similar_products`, `my_orders`, `track_shipment`) and may only
  recommend products a tool returned. Prices and stock always come from catalog, never from
  the model. The web app renders the returned products as cards under the answer.
- **Always works**: without `GEMINI_API_KEY`, or when Gemini fails (quota, network), a
  rule-based assistant answers the same intents with the same tools: budget parsing
  ("audífonos por menos de 200 mil", "un portátil hasta 3 millones"), order status for
  signed-in users and shipment tracking.
- **Semantic search** over product vectors with `$vectorSearch` (HNSW) and pre-filters on
  category, store and price. On plain MongoDB, or while the index is building, it falls back to
  exact cosine similarity in memory.
- **Two embedders**: `gemini-embedding-001` (768 dimensions) with a key; otherwise a
  deterministic hashed bag of words and trigrams with a Spanish→English shopping lexicon, so
  Spanish queries find the English catalog. Each embedder writes to its own collection, so
  vectors from different models never mix.
- **Incremental indexing**: on boot, catalog's export is compared by content hash and only
  new or changed products are embedded. Catalog events on the shared Redis Stream keep the
  index fresh, with the same contract as the Node services (consumer group, idempotency keys,
  dead-letter stream).
- **Recommendations**: "similar products" by vector, and "for you" from the centroid of the
  user's wishlist and purchases (best sellers when there is no history).
- **Copywriter** for sellers: structured JSON output (response schema) that fills the product
  form. The prompt forbids inventing specifications; the fallback template only rewrites the
  seller's own notes.
- **Guard rails**: per-user (or IP) rate limit in Redis to protect the free Gemini quota,
  role checks with the same RS256 tokens (JWKS) as every other service, Prometheus metrics.

## Endpoints

| Method | Path | |
| --- | --- | --- |
| POST | `/ai/assistant` | `{ message, history[], currency, locale }` → reply, products, tools used |
| GET | `/ai/search?q&currency&limit&category&maxPrice` | Semantic search (prices in minor units) |
| GET | `/ai/similar/:productId` | Similar products |
| GET | `/ai/recommendations` | Personalised picks (signed in) |
| POST | `/ai/copywriter` | Listing draft for sellers |
| GET | `/ai/status` | Provider, embedder and index size |
| POST | `/ai/admin/reindex` | Full re-sync (admin) |
| GET | `/health`, `/metrics`, `/openapi.json` | Operations |

## Development

```bash
cd services/ai
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
.venv/bin/pytest -q          # 26 tests (MongoDB + Redis; neighbour services faked with httpx)
.venv/bin/ruff check . && .venv/bin/ruff format --check .
```

Settings come from the environment (`AI_<KEY>` overrides `<KEY>`): `GEMINI_API_KEY`,
`GEMINI_MODEL` (default `gemini-3.5-flash-lite`), `MONGODB_URI`, `REDIS_URL`, `JWKS_URL`,
`CATALOG_URL`, `ORDERS_URL`, `FULFILLMENT_URL`, `ENGAGEMENT_URL`, `INTERNAL_API_KEY`,
`CHAT_LIMIT` / `CHAT_WINDOW_SECONDS`.
