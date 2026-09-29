"""Settings. Like the Node services, `AI_<KEY>` overrides `<KEY>` so one process can host
several services with different values (the free demo bundle)."""

import os
from dataclasses import dataclass
from functools import lru_cache


def env(key: str, default: str = "") -> str:
    return os.environ.get(f"AI_{key}") or os.environ.get(key) or default


@dataclass(frozen=True)
class Settings:
    mongo_uri: str
    mongo_db: str
    redis_url: str
    jwks_url: str
    internal_key: str
    catalog_url: str
    orders_url: str
    fulfillment_url: str
    engagement_url: str
    gemini_api_key: str
    gemini_model: str
    gemini_fallback_model: str
    embedding_model: str
    consume_events: bool
    index_on_boot: bool
    # Protects the free Gemini quota: assistant messages per user (or IP) per window.
    chat_limit: int
    chat_window_seconds: int


@lru_cache
def settings() -> Settings:
    return Settings(
        mongo_uri=env("MONGODB_URI", "mongodb://localhost:27017/?directConnection=true"),
        mongo_db=env("MONGODB_DB", "ai"),
        redis_url=env("REDIS_URL", "redis://localhost:6379"),
        jwks_url=env("JWKS_URL", "http://localhost:4001/.well-known/jwks.json"),
        internal_key=env("INTERNAL_API_KEY", "dev-internal-key"),
        catalog_url=env("CATALOG_URL", "http://localhost:4002"),
        orders_url=env("ORDERS_URL", "http://localhost:4003"),
        fulfillment_url=env("FULFILLMENT_URL", "http://localhost:4005"),
        engagement_url=env("ENGAGEMENT_URL", "http://localhost:4006"),
        gemini_api_key=env("GEMINI_API_KEY"),
        gemini_model=env("GEMINI_MODEL", "gemini-3.5-flash-lite"),
        gemini_fallback_model=env("GEMINI_FALLBACK_MODEL", "gemini-3.5-flash"),
        embedding_model=env("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001"),
        consume_events=env("CONSUME_EVENTS", "true") == "true",
        index_on_boot=env("INDEX_ON_BOOT", "true") == "true",
        chat_limit=int(env("CHAT_LIMIT", "30")),
        chat_window_seconds=int(env("CHAT_WINDOW_SECONDS", "600")),
    )
