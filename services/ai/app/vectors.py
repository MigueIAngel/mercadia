"""Product vectors in MongoDB, queried with Atlas Vector Search.

Atlas (and the Atlas Local image used in development and CI) answers `$vectorSearch` with an
HNSW index and pre-filters on category, store and price. On plain MongoDB, or while the index
is still building, the store falls back to exact cosine similarity in memory, which is fine
at demo scale (a few hundred products).
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

from pymongo import UpdateOne
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.operations import SearchIndexModel

from .embeddings import Embedder

log = logging.getLogger("ai.vectors")
INDEX = "vector_index"


@dataclass
class SearchFilter:
    category: str | None = None
    store_id: str | None = None
    max_price_usd: int | None = None
    min_price_usd: int | None = None
    exclude: list[str] = field(default_factory=list)

    def mongo(self) -> dict:
        f: dict = {}
        if self.category:
            f["category"] = self.category
        if self.store_id:
            f["storeId"] = self.store_id
        price: dict = {}
        if self.max_price_usd is not None:
            price["$lte"] = self.max_price_usd
        if self.min_price_usd is not None:
            price["$gte"] = self.min_price_usd
        if price:
            f["priceUsd"] = price
        return f

    def matches(self, doc: dict) -> bool:
        if doc["_id"] in self.exclude:
            return False
        if self.category and doc.get("category") != self.category:
            return False
        if self.store_id and doc.get("storeId") != self.store_id:
            return False
        price = doc.get("priceUsd", 0)
        if self.max_price_usd is not None and price > self.max_price_usd:
            return False
        return not (self.min_price_usd is not None and price < self.min_price_usd)


class VectorStore:
    def __init__(self, db: AsyncDatabase, embedder: Embedder):
        self.embedder = embedder
        self.col = db[f"vectors_{embedder.name}"]
        self.atlas = False
        self._cache: list[dict] | None = None

    async def ensure_index(self) -> None:
        try:
            existing = [i async for i in await self.col.list_search_indexes(INDEX)]
            if not existing:
                await self.col.create_search_index(
                    SearchIndexModel(
                        name=INDEX,
                        type="vectorSearch",
                        definition={
                            "fields": [
                                {
                                    "type": "vector",
                                    "path": "vector",
                                    "numDimensions": self.embedder.dims,
                                    "similarity": "dotProduct",
                                },
                                {"type": "filter", "path": "category"},
                                {"type": "filter", "path": "storeId"},
                                {"type": "filter", "path": "priceUsd"},
                            ]
                        },
                    )
                )
            self.atlas = True
            log.info("Atlas Vector Search index ready on %s", self.col.name)
        except Exception as error:  # plain MongoDB: no search indexes
            self.atlas = False
            log.info("vector search index unavailable (%s): using in-memory cosine", error)

    async def hashes(self) -> dict[str, str]:
        return {d["_id"]: d["hash"] async for d in self.col.find({}, {"hash": 1})}

    async def upsert(self, docs: list[dict]) -> None:
        if not docs:
            return
        await self.col.bulk_write(
            [UpdateOne({"_id": d["_id"]}, {"$set": d}, upsert=True) for d in docs]
        )
        self._cache = None

    async def delete(self, ids: list[str]) -> None:
        if ids:
            await self.col.delete_many({"_id": {"$in": ids}})
            self._cache = None

    async def count(self) -> int:
        return await self.col.count_documents({})

    async def get(self, product_id: str) -> dict | None:
        return await self.col.find_one({"_id": product_id})

    async def search(
        self, vector: list[float], limit: int = 10, where: SearchFilter | None = None
    ) -> list[tuple[str, float]]:
        where = where or SearchFilter()
        if self.atlas:
            try:
                return await self._atlas(vector, limit, where)
            except Exception as error:  # index still building, or not supported
                log.warning("$vectorSearch failed, falling back to memory: %s", error)
        return await self._memory(vector, limit, where)

    async def _atlas(self, vector, limit, where: SearchFilter) -> list[tuple[str, float]]:
        stage: dict = {
            "index": INDEX,
            "path": "vector",
            "queryVector": vector,
            "numCandidates": max(100, (limit + len(where.exclude)) * 15),
            "limit": limit + len(where.exclude),
        }
        if f := where.mongo():
            stage["filter"] = f
        started = time.perf_counter()
        cursor = await self.col.aggregate(
            [
                {"$vectorSearch": stage},
                {"$project": {"_id": 1, "score": {"$meta": "vectorSearchScore"}}},
            ]
        )
        rows = [(d["_id"], float(d["score"])) async for d in cursor]
        log.debug("$vectorSearch %.1f ms", (time.perf_counter() - started) * 1000)
        if not rows and await self.col.estimated_document_count() > 0:
            # A fresh index can answer empty while it syncs: don't show "no results".
            raise RuntimeError("index not synced yet")
        return [r for r in rows if r[0] not in where.exclude][:limit]

    async def _memory(self, vector, limit, where: SearchFilter) -> list[tuple[str, float]]:
        if self._cache is None:
            self._cache = [d async for d in self.col.find({})]
        scored = [
            (d["_id"], (1 + sum(a * b for a, b in zip(vector, d["vector"], strict=False))) / 2)
            for d in self._cache
            if where.matches(d)
        ]
        scored.sort(key=lambda r: r[1], reverse=True)
        return scored[:limit]
