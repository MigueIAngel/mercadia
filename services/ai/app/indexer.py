"""Keeps product vectors in sync with the catalog.

On boot every active product is exported from catalog and only new or changed ones are
embedded (content hash). Afterwards catalog events on the shared Redis Stream keep the index
fresh: the consumer follows the same contract as the Node EventBus (own consumer group,
`processed:<group>:<id>` idempotency keys, dead-letter stream after repeated failures).
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import json
import logging
import socket

from redis.asyncio import Redis
from redis.exceptions import ResponseError

from .clients import Services
from .embeddings import Embedder, product_text
from .vectors import VectorStore

log = logging.getLogger("ai.indexer")

STREAM = "mercadia:events"
GROUP = "ai"
PRODUCT_EVENTS = {
    "product.published",
    "product.updated",
    "product.unpublished",
    "product.price_changed",
}
PROCESSED_TTL = 7 * 24 * 3600
MAX_ATTEMPTS = 5


def content_hash(product: dict, embedder: Embedder) -> str:
    text = product_text(product)
    return hashlib.sha1(f"{embedder.name}\n{text}".encode()).hexdigest()


class Indexer:
    def __init__(self, services: Services, store: VectorStore, embedder: Embedder):
        self.services = services
        self.store = store
        self.embedder = embedder
        self.lock = asyncio.Lock()

    def _doc(self, p: dict, vector: list[float], digest: str) -> dict:
        return {
            "_id": p["id"],
            "vector": vector,
            "hash": digest,
            "slug": p["slug"],
            "title": p["title"],
            "category": p["category"],
            "subcategory": p.get("subcategory"),
            "storeId": p["storeId"],
            "priceUsd": p["priceUsd"],
            "rating": p.get("ratingAvg", 0),
            "sales": p.get("salesCount", 0),
        }

    async def _embed(self, products: list[dict], known: dict[str, str]) -> int:
        todo = [(p, content_hash(p, self.embedder)) for p in products]
        todo = [(p, h) for p, h in todo if known.get(p["id"]) != h]
        # Metadata-only changes (price, rating) still need the filter fields updated.
        for start in range(0, len(todo), 50):
            batch = todo[start : start + 50]
            vectors = await self.embedder.embed_documents([product_text(p) for p, _ in batch])
            await self.store.upsert(
                [self._doc(p, v, h) for (p, h), v in zip(batch, vectors, strict=True)]
            )
        return len(todo)

    async def sync_all(self) -> dict:
        async with self.lock:
            products = await self.services.export_products()
            if not products:
                log.warning("catalog export returned nothing; keeping the current index")
                return {"indexed": 0, "removed": 0, "total": await self.store.count()}
            known = await self.store.hashes()
            indexed = await self._embed(products, known)
            live = {p["id"] for p in products}
            stale = [i for i in known if i not in live]
            await self.store.delete(stale)
            await self._refresh_metadata(products)
            total = await self.store.count()
            log.info("index sync: %d embedded, %d removed, %d total", indexed, len(stale), total)
            return {"indexed": indexed, "removed": len(stale), "total": total}

    async def _refresh_metadata(self, products: list[dict]) -> None:
        # Price, rating and sales change often and don't affect the text: update them in place.
        from pymongo import UpdateOne

        ops = [
            UpdateOne(
                {"_id": p["id"]},
                {
                    "$set": {
                        "priceUsd": p["priceUsd"],
                        "rating": p.get("ratingAvg", 0),
                        "sales": p.get("salesCount", 0),
                    }
                },
            )
            for p in products
        ]
        if ops:
            await self.store.col.bulk_write(ops)
            self.store._cache = None

    async def sync_ids(self, ids: list[str]) -> None:
        async with self.lock:
            products = await self.services.export_products(ids)
            active = [p for p in products if p.get("status") == "active"]
            known = {i: h for i, h in (await self.store.hashes()).items() if i in ids}
            await self._embed(active, known)
            await self._refresh_metadata(active)
            gone = [i for i in ids if i not in {p["id"] for p in active}]
            await self.store.delete(gone)


class EventConsumer:
    def __init__(self, redis_url: str, indexer: Indexer):
        # The socket timeout must outlast the 20 s blocking read.
        self.redis = Redis.from_url(redis_url, decode_responses=True, socket_timeout=30)
        self.indexer = indexer
        self.consumer = f"{socket.gethostname()}-{id(self)}"
        self.attempts: dict[str, int] = {}
        self.task: asyncio.Task | None = None

    def start(self) -> None:
        self.task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self.task:
            self.task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self.task
        await self.redis.aclose()

    async def ensure_group(self) -> None:
        try:
            await self.redis.xgroup_create(STREAM, GROUP, id="0", mkstream=True)
        except ResponseError as error:
            if "BUSYGROUP" not in str(error):
                raise

    async def handle(self, entries: list[tuple[str, dict]]) -> None:
        """Processes one batch: product ids are de-duplicated and re-indexed together."""
        ids: dict[str, list[tuple[str, str]]] = {}
        for entry_id, fields in entries:
            raw = fields.get("event", "")
            try:
                event = json.loads(raw)
                event_id, kind = event["id"], event["type"]
            except (ValueError, KeyError, TypeError):
                await self._dead_letter(entry_id, raw, "malformed")
                continue
            key = f"processed:{GROUP}:{event_id}"
            if kind not in PRODUCT_EVENTS or await self.redis.exists(key):
                await self.redis.xack(STREAM, GROUP, entry_id)
                continue
            product_id = (event.get("data") or {}).get("productId")
            if not product_id:
                await self.redis.xack(STREAM, GROUP, entry_id)
                continue
            ids.setdefault(product_id, []).append((entry_id, key))
        if not ids:
            return
        try:
            await self.indexer.sync_ids(list(ids))
        except Exception as error:
            log.error("re-index failed: %s", error)
            for pending in ids.values():
                for entry_id, _ in pending:
                    attempt = self.attempts.get(entry_id, 0) + 1
                    self.attempts[entry_id] = attempt
                    if attempt >= MAX_ATTEMPTS:
                        await self._dead_letter(entry_id, "", str(error))
            return
        for pending in ids.values():
            for entry_id, key in pending:
                await self.redis.set(key, "1", ex=PROCESSED_TTL)
                await self.redis.xack(STREAM, GROUP, entry_id)
                self.attempts.pop(entry_id, None)
        log.info("re-indexed %d product(s) from events", len(ids))

    async def poll(self, pending: bool = False, block_ms: int = 20_000) -> int:
        reply = await self.redis.xreadgroup(
            GROUP,
            self.consumer,
            {STREAM: "0" if pending else ">"},
            count=50,
            block=None if pending else block_ms,
        )
        count = 0
        for _, entries in reply or []:
            await self.handle(entries)
            count += len(entries)
        return count

    async def _dead_letter(self, entry_id: str, raw: str, reason: str) -> None:
        await self.redis.xadd(f"{STREAM}:dlq", {"event": raw, "reason": reason, "group": GROUP})
        await self.redis.xack(STREAM, GROUP, entry_id)
        self.attempts.pop(entry_id, None)

    async def _run(self) -> None:
        recovered = False
        while True:
            try:
                await self.ensure_group()
                if not recovered or self.attempts:
                    await self.poll(pending=True)
                    recovered = True
                await self.poll()
            except asyncio.CancelledError:
                raise
            except Exception as error:
                log.error("consumer loop error: %s", error)
                await asyncio.sleep(3)
