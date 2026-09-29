"""Semantic search and recommendations on top of the vector store."""

from __future__ import annotations

import logging

from .auth import User
from .clients import Services
from .embeddings import Embedder
from .vectors import SearchFilter, VectorStore

log = logging.getLogger("ai.search")


def to_usd_cents(amount: float, currency: str, usd_to_cop: float) -> int:
    """Converts minor units (COP centavos or USD cents, as the catalog uses) to USD cents."""
    if currency == "USD":
        return int(amount)
    return int(amount / usd_to_cop)


class SearchService:
    def __init__(self, services: Services, store: VectorStore, embedder: Embedder):
        self.services = services
        self.store = store
        self.embedder = embedder

    async def _hydrate(self, hits: list[tuple[str, float]], currency: str) -> list[dict]:
        products = await self.services.products_by_ids([i for i, _ in hits], currency)
        scores = dict(hits)
        return [{**p, "score": round(scores[p["id"]], 4)} for p in products]

    async def filter_for(
        self,
        currency: str,
        category: str | None = None,
        max_price: float | None = None,
        min_price: float | None = None,
        exclude: list[str] | None = None,
    ) -> SearchFilter:
        rate = await self.services.usd_to_cop() if (max_price or min_price) else 0
        return SearchFilter(
            category=category,
            max_price_usd=to_usd_cents(max_price, currency, rate) if max_price else None,
            min_price_usd=to_usd_cents(min_price, currency, rate) if min_price else None,
            exclude=exclude or [],
        )

    async def search(
        self,
        query: str,
        currency: str = "COP",
        limit: int = 12,
        category: str | None = None,
        max_price: float | None = None,
        min_price: float | None = None,
    ) -> list[dict]:
        try:
            vector = await self.embedder.embed_query(query)
        except Exception as error:  # e.g. the embeddings quota is exhausted
            log.warning("query embedding failed, using keyword search: %s", str(error)[:120])
            items = await self.services.keyword_search(query, currency, limit, category, max_price)
            return [{**p, "score": None} for p in items]
        where = await self.filter_for(currency, category, max_price, min_price)
        hits = await self.store.search(vector, limit, where)
        return await self._hydrate(hits, currency)

    async def similar(self, product_id: str, currency: str = "COP", limit: int = 8) -> list[dict]:
        doc = await self.store.get(product_id)
        if not doc:
            return []
        hits = await self.store.search(doc["vector"], limit, SearchFilter(exclude=[product_id]))
        return await self._hydrate(hits, currency)

    async def for_user(self, user: User, currency: str = "COP", limit: int = 8) -> dict:
        """Centroid of what the user saved and bought; best sellers when there is no history."""
        wished = await self.services.wishlist_ids(user.token)
        orders = await self.services.my_orders(user.token)
        bought = [i.get("productId") for o in orders for i in o.get("items", [])]
        seeds = list(dict.fromkeys([*wished, *[b for b in bought if b]]))[:30]
        vectors = [d["vector"] for i in seeds if (d := await self.store.get(i))]
        if not vectors:
            return {"basedOn": 0, "items": await self.services.bestsellers(currency, limit)}
        centroid = [sum(col) / len(vectors) for col in zip(*vectors, strict=True)]
        norm = sum(v * v for v in centroid) ** 0.5 or 1.0
        hits = await self.store.search(
            [v / norm for v in centroid], limit, SearchFilter(exclude=seeds)
        )
        return {"basedOn": len(vectors), "items": await self._hydrate(hits, currency)}
