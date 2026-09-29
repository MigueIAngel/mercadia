"""Test setup: real MongoDB (Atlas Local) and Redis, fake JWKS, fake neighbour services."""

import json
import os
import time
from urllib.parse import parse_qs, urlparse

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

os.environ.update(
    {
        "AI_MONGODB_DB": "ai_test",
        "AI_REDIS_URL": os.environ.get("TEST_REDIS_URL", "redis://localhost:6379/9"),
        "AI_CONSUME_EVENTS": "false",
        "AI_INDEX_ON_BOOT": "false",
        "AI_GEMINI_API_KEY": "",
        "AI_CHAT_LIMIT": "5",
    }
)

from app import auth, clients  # noqa: E402

PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)

STORE = "store-casa"
PRODUCTS = [
    {
        "id": "p-phone",
        "slug": "iphone-x",
        "title": "iPhone X",
        "description": "Apple smartphone with OLED display and dual camera.",
        "brand": "Apple",
        "category": "electronics",
        "subcategory": "smartphones",
        "tags": ["smartphones", "apple"],
        "storeId": "store-tech",
        "storeName": "TecnoNova",
        "priceUsd": 89999,
        "ratingAvg": 4.5,
        "salesCount": 10,
        "status": "active",
    },
    {
        "id": "p-earbuds",
        "slug": "beats-flex",
        "title": "Beats Flex Wireless Earphones",
        "description": "Wireless earphones with magnetic earbuds and all-day battery.",
        "brand": "Beats",
        "category": "electronics",
        "subcategory": "mobile-accessories",
        "tags": ["audio", "wireless"],
        "storeId": "store-tech",
        "storeName": "TecnoNova",
        "priceUsd": 4999,
        "ratingAvg": 4.8,
        "salesCount": 30,
        "status": "active",
    },
    {
        "id": "p-sofa",
        "slug": "knoll-sofa",
        "title": "Knoll Saarinen Sofa",
        "description": "Three-seat sofa upholstered in wool for the living room.",
        "brand": "Knoll",
        "category": "home",
        "subcategory": "furniture",
        "tags": ["furniture", "living room"],
        "storeId": STORE,
        "storeName": "Casa Viva",
        "priceUsd": 149900,
        "ratingAvg": 4.2,
        "salesCount": 2,
        "status": "active",
    },
    {
        "id": "p-perfume",
        "slug": "dior-jadore",
        "title": "Dior J'adore",
        "description": "Floral eau de parfum for women.",
        "brand": "Dior",
        "category": "beauty",
        "subcategory": "fragrances",
        "tags": ["fragrances", "perfume"],
        "storeId": "store-beauty",
        "storeName": "Belleza Pura",
        "priceUsd": 7999,
        "ratingAvg": 4.9,
        "salesCount": 12,
        "status": "active",
    },
]
RATE = 4000  # 1 USD = 4000 COP in the fake catalog


def summary(p: dict, currency: str) -> dict:
    price = p["priceUsd"] * (RATE if currency == "COP" else 1)
    return {
        "id": p["id"],
        "slug": p["slug"],
        "title": p["title"],
        "brand": p["brand"],
        "category": p["category"],
        "image": None,
        "price": price,
        "compareAt": None,
        "currency": currency,
        "rating": {"avg": p["ratingAvg"], "count": 3},
        "store": {"id": p["storeId"], "name": p["storeName"], "slug": p["storeId"]},
        "inStock": True,
    }


class FakeServices:
    """State the fake neighbours serve; tests mutate it."""

    def __init__(self):
        self.products = [dict(p) for p in PRODUCTS]
        self.wishlist: list[str] = []
        self.orders: list[dict] = []
        self.calls: list[str] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        url = urlparse(str(request.url))
        path, query = url.path, parse_qs(url.query)
        self.calls.append(f"{request.method} {path}")
        by_id = {p["id"]: p for p in self.products}
        if path == "/internal/products/export":
            if request.headers.get("x-internal-key") != "dev-internal-key":
                return httpx.Response(403)
            if "ids" in query:
                ids = query["ids"][0].split(",")
                return httpx.Response(200, json=[by_id[i] for i in ids if i in by_id])
            return httpx.Response(200, json=[p for p in self.products if p["status"] == "active"])
        if path == "/products/by-ids":
            body = json.loads(request.content)
            rows = [summary(by_id[i], body["currency"]) for i in body["ids"] if i in by_id]
            return httpx.Response(200, json=rows)
        if path == "/currency/rates":
            return httpx.Response(200, json={"base": "USD", "rates": {"USD": 1, "COP": RATE}})
        if path == "/products" and "q" in query:  # keyword search (fallback): best sellers
            ranked = sorted(self.products, key=lambda p: -p["salesCount"])
            return httpx.Response(200, json={"items": [summary(p, "COP") for p in ranked]})
        if path == "/products" and query.get("sort") == ["bestselling"]:
            currency = query.get("currency", ["COP"])[0]
            ranked = sorted(self.products, key=lambda p: -p["salesCount"])
            return httpx.Response(200, json={"items": [summary(p, currency) for p in ranked]})
        if path.startswith("/products/"):
            slug = path.rsplit("/", 1)[1]
            p = next((p for p in self.products if p["slug"] == slug), None)
            if not p:
                return httpx.Response(404)
            currency = query.get("currency", ["COP"])[0]
            return httpx.Response(
                200,
                json={**summary(p, currency), "description": p["description"], "variants": []},
            )
        auth_header = request.headers.get("authorization", "")
        if path == "/orders":
            return httpx.Response(200 if auth_header else 401, json=self.orders)
        if path == "/wishlist/ids":
            return httpx.Response(200 if auth_header else 401, json=self.wishlist)
        if path.startswith("/shipments/track/"):
            number = path.rsplit("/", 1)[1]
            if number != "MC0000000001":
                return httpx.Response(404)
            return httpx.Response(
                200,
                json={
                    "trackingNumber": number,
                    "carrier": "Mercadia Envíos",
                    "status": "in_transit",
                    "destinationCity": "Cali",
                    "estimatedDelivery": "2026-10-02T00:00:00Z",
                    "events": [{"status": "in_transit", "location": "Bogotá"}],
                },
            )
        return httpx.Response(404)


class FakeJwks:
    def get_signing_key_from_jwt(self, token):
        return type("Key", (), {"key": PRIVATE_KEY.public_key()})()


def make_token(sub="u-laura", roles=("buyer",), store_id=None, name="Laura Gómez") -> str:
    claims = {
        "sub": sub,
        "name": name,
        "roles": list(roles),
        "iss": auth.ISSUER,
        "aud": auth.AUDIENCE,
        "exp": int(time.time()) + 600,
    }
    if store_id:
        claims["storeId"] = store_id
    return jwt.encode(claims, PRIVATE_KEY, algorithm="RS256")


@pytest.fixture(scope="session")
def fake():
    return FakeServices()


@pytest.fixture(scope="session")
def client(fake):
    from fastapi.testclient import TestClient
    from pymongo import MongoClient
    from redis import Redis

    from app.config import settings
    from app.main import app, state

    cfg = settings()
    MongoClient(cfg.mongo_uri).drop_database(cfg.mongo_db)
    Redis.from_url(cfg.redis_url).flushdb()
    clients.transport_override = httpx.MockTransport(fake.handler)
    auth._jwks = FakeJwks()
    with TestClient(app) as c:
        c.portal.call(state.indexer.sync_all)
        yield c


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
