"""Mercadia AI service (FastAPI): shopping assistant, semantic search, recommendations and the
seller copywriter. Routes live under /ai so the gateway can forward /api/ai/* unchanged."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from pydantic import BaseModel, Field
from pymongo import AsyncMongoClient
from redis.asyncio import Redis

from .assistant import Assistant, Tools, Turn
from .auth import User, current_user, optional_user, require_role
from .clients import Services
from .config import settings
from .copywriter import Copywriter
from .embeddings import make_embedder
from .indexer import EventConsumer, Indexer
from .search import SearchService
from .vectors import VectorStore

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("ai")

REQUESTS = Counter("http_requests_total", "HTTP requests", ["service", "method", "route", "status"])
LATENCY = Histogram(
    "http_request_duration_seconds", "HTTP request latency", ["service", "method", "route"]
)
ASSISTANT = Counter("ai_assistant_replies_total", "Assistant replies", ["provider"])

Currency = Literal["COP", "USD"]


class State:
    mongo: AsyncMongoClient
    redis: Redis
    services: Services
    store: VectorStore
    indexer: Indexer
    search: SearchService
    assistant: Assistant
    copywriter: Copywriter
    consumer: EventConsumer | None = None
    provider: str = "local"


state = State()


async def _initial_index() -> None:
    # Catalog may still be starting (same container in the demo): retry for a while.
    for attempt in range(30):
        try:
            result = await state.indexer.sync_all()
            if result["total"]:
                return
        except Exception as error:
            log.warning("initial index attempt %d failed: %s", attempt + 1, error)
        await asyncio.sleep(min(2 + attempt, 10))


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = settings()
    state.mongo = AsyncMongoClient(cfg.mongo_uri)
    db = state.mongo[cfg.mongo_db]
    state.redis = Redis.from_url(cfg.redis_url, decode_responses=True)
    state.services = Services(cfg)
    embedder = make_embedder(cfg.gemini_api_key, cfg.embedding_model)
    state.provider = "gemini" if cfg.gemini_api_key else "local"
    state.store = VectorStore(db, embedder)
    await state.store.ensure_index()
    state.indexer = Indexer(state.services, state.store, embedder)
    state.search = SearchService(state.services, state.store, embedder)
    state.assistant = Assistant(
        Tools(state.services, state.search), cfg.gemini_api_key, cfg.gemini_model
    )
    state.copywriter = Copywriter(cfg.gemini_api_key, cfg.gemini_model)
    background: list[asyncio.Task] = []
    if cfg.index_on_boot:
        background.append(asyncio.create_task(_initial_index()))
    if cfg.consume_events:
        state.consumer = EventConsumer(cfg.redis_url, state.indexer)
        state.consumer.start()
    log.info("ai service ready (provider=%s, atlas=%s)", state.provider, state.store.atlas)
    yield
    for task in background:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
    if state.consumer:
        await state.consumer.stop()
    await state.services.close()
    await state.redis.aclose()
    await state.mongo.close()


app = FastAPI(
    title="Mercadia AI",
    description="Shopping assistant (Gemini function calling), semantic search with Atlas "
    "Vector Search, recommendations and the seller copywriter.",
    version="1.0.0",
    lifespan=lifespan,
)


@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    route = request.scope.get("route")
    path = getattr(route, "path", "unmatched")
    if path not in ("/metrics", "/health"):
        REQUESTS.labels("ai", request.method, path, response.status_code).inc()
        LATENCY.labels("ai", request.method, path).observe(time.perf_counter() - started)
    return response


# ----- operations -----


@app.get("/health", tags=["ops"])
async def health(response: Response):
    checks = {}
    for name, probe in (
        ("mongodb", lambda: state.mongo.admin.command("ping")),
        ("redis", lambda: state.redis.ping()),
    ):
        try:
            await asyncio.wait_for(probe(), 2)
            checks[name] = "up"
        except Exception:
            checks[name] = "down"
    status = "up" if all(v == "up" for v in checks.values()) else "down"
    if status != "up":
        response.status_code = 503
    return {"status": status, "service": "ai", "checks": checks}


@app.get("/metrics", include_in_schema=False)
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/ai/status", tags=["ops"])
async def status():
    return {
        "provider": state.provider,
        "embeddings": state.store.embedder.name,
        "vectorSearch": "atlas" if state.store.atlas else "memory",
        "indexedProducts": await state.store.count(),
    }


@app.post("/ai/admin/reindex", tags=["ops"])
async def reindex(_: User = Depends(require_role("admin"))):
    return await state.indexer.sync_all()


# ----- search and recommendations -----


@app.get("/ai/search", tags=["search"])
async def semantic_search(
    q: str = Query(min_length=2, max_length=200),
    currency: Currency = "COP",
    limit: int = Query(12, ge=1, le=48),
    category: str | None = None,
    maxPrice: float | None = Query(None, gt=0),  # noqa: N803 (public query name)
):
    started = time.perf_counter()
    items = await state.search.search(q, currency, limit, category, maxPrice)
    return {
        "query": q,
        "items": items,
        "tookMs": round((time.perf_counter() - started) * 1000),
        "engine": state.store.embedder.name,
    }


@app.get("/ai/similar/{product_id}", tags=["search"])
async def similar(product_id: str, currency: Currency = "COP", limit: int = Query(8, ge=1, le=24)):
    return {"items": await state.search.similar(product_id, currency, limit)}


@app.get("/ai/recommendations", tags=["search"])
async def recommendations(currency: Currency = "COP", user: User = Depends(current_user)):
    return await state.search.for_user(user, currency)


# ----- assistant -----


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(max_length=2000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=20)
    currency: Currency = "COP"
    locale: Literal["es", "en"] = "es"


async def rate_limit(request: Request, user: User | None) -> None:
    cfg = settings()
    who = user.id if user else request.headers.get("x-client-ip") or request.client.host
    key = f"ai:chat:{who}"
    try:
        count = await state.redis.incr(key)
        if count == 1:
            await state.redis.expire(key, cfg.chat_window_seconds)
    except Exception:
        return  # fail open, like the gateway limiter
    if count > cfg.chat_limit:
        raise HTTPException(429, "Too many assistant messages, try again in a few minutes")


@app.post("/ai/assistant", tags=["assistant"])
async def assistant(
    body: ChatRequest, request: Request, user: User | None = Depends(optional_user)
):
    await rate_limit(request, user)
    result = await state.assistant.reply(
        [Turn(t.role, t.text) for t in body.history],
        body.message,
        user,
        body.currency,
        body.locale,
    )
    ASSISTANT.labels(result["provider"]).inc()
    return result


# ----- seller copywriter -----


class CopyRequest(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    features: str = Field("", max_length=2000)
    category: str | None = None
    brand: str | None = Field(None, max_length=60)
    tone: Literal["professional", "friendly", "premium"] = "professional"
    locale: Literal["es", "en"] = "es"


@app.post("/ai/copywriter", tags=["seller"])
async def copywriter(
    body: CopyRequest, request: Request, user: User = Depends(require_role("seller"))
):
    await rate_limit(request, user)
    return await state.copywriter.write(
        body.title, body.features, body.category, body.brand, body.tone, body.locale
    )
