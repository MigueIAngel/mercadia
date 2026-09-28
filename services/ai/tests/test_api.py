"""API tests against real MongoDB and Redis, with the neighbour services faked."""

import json

from app.main import state
from tests.conftest import STORE, bearer, make_token


def test_health_and_status(client):
    assert client.get("/health").json() == {
        "status": "up",
        "service": "ai",
        "checks": {"mongodb": "up", "redis": "up"},
    }
    status = client.get("/ai/status").json()
    assert status["provider"] == "local"
    assert status["indexedProducts"] == 4


def test_semantic_search_in_spanish_returns_hydrated_products(client):
    res = client.get("/ai/search", params={"q": "audífonos inalámbricos", "limit": 2}).json()
    assert res["items"][0]["id"] == "p-earbuds"
    assert res["items"][0]["price"] == 4999 * 4000  # COP minor units from the catalog
    assert res["items"][0]["score"] > res["items"][1]["score"]


def test_price_and_category_filters(client):
    # $300.000 COP = US$75 → the US$899 phone is out, the US$49 earbuds are in.
    res = client.get(
        "/ai/search", params={"q": "apple phone", "maxPrice": 30_000_000, "limit": 4}
    ).json()
    ids = [p["id"] for p in res["items"]]
    assert "p-phone" not in ids
    assert "p-earbuds" in ids
    beauty = client.get("/ai/search", params={"q": "gift", "category": "beauty"}).json()
    assert [p["id"] for p in beauty["items"]] == ["p-perfume"]


def test_similar_products_exclude_the_product_itself(client):
    items = client.get("/ai/similar/p-phone", params={"limit": 2}).json()["items"]
    assert items[0]["id"] == "p-earbuds"
    assert "p-phone" not in [p["id"] for p in items]


def test_recommendations_use_history_or_fall_back_to_best_sellers(client, fake):
    token = make_token()
    assert client.get("/ai/recommendations").status_code == 401
    cold = client.get("/ai/recommendations", headers=bearer(token)).json()
    assert cold["basedOn"] == 0
    assert cold["items"][0]["id"] == "p-earbuds"  # best seller

    fake.wishlist = ["p-phone"]
    warm = client.get("/ai/recommendations", headers=bearer(token)).json()
    fake.wishlist = []
    assert warm["basedOn"] == 1
    assert warm["items"][0]["id"] == "p-earbuds"
    assert "p-phone" not in [p["id"] for p in warm["items"]]


def test_assistant_searches_with_a_budget(client):
    res = client.post(
        "/ai/assistant",
        json={"message": "busco audífonos inalámbricos por menos de 300 mil", "locale": "es"},
    ).json()
    assert res["provider"] == "local"
    assert res["tools"] == ["search_products"]
    assert [p["id"] for p in res["products"]] == ["p-earbuds"]
    assert "Beats Flex" in res["reply"] and "$ 199.960" in res["reply"]


def test_assistant_orders_need_a_session_and_tracking_works(client, fake):
    guest = client.post("/ai/assistant", json={"message": "¿dónde está mi pedido?"}).json()
    assert "ingresa" in guest["reply"]

    fake.orders = [
        {"number": 5003, "status": "shipped", "total": 20_000_000, "currency": "COP", "items": []}
    ]
    mine = client.post(
        "/ai/assistant",
        json={"message": "mis pedidos", "locale": "es"},
        headers=bearer(make_token(sub="u-orders")),
    ).json()
    assert "#5003 · shipped · $ 200.000" in mine["reply"]

    tracked = client.post(
        "/ai/assistant", json={"message": "rastrea MC0000000001", "locale": "en"}
    ).json()
    assert tracked["tracking"]["destinationCity"] == "Cali"
    assert "Estimated delivery: 2026-10-02" in tracked["reply"]


def test_assistant_is_rate_limited(client):
    headers = {"x-client-ip": "203.0.113.9"}
    codes = [
        client.post("/ai/assistant", json={"message": "hola"}, headers=headers).status_code
        for _ in range(6)
    ]
    assert codes == [200] * 5 + [429]


def test_copywriter_is_for_sellers_only(client):
    body = {"title": "Sofá cama", "features": "tela antifluidos; 3 puestos", "locale": "es"}
    assert client.post("/ai/copywriter", json=body).status_code == 401
    buyer = bearer(make_token(sub="u-buyer2"))
    assert client.post("/ai/copywriter", json=body, headers=buyer).status_code == 403
    seller = bearer(make_token(sub="u-seller", roles=("buyer", "seller"), store_id=STORE))
    res = client.post("/ai/copywriter", json=body, headers=seller)
    assert res.status_code == 200
    assert res.json()["bullets"] == ["Tela antifluidos", "3 puestos"]


def test_catalog_events_keep_the_index_fresh(client, fake):
    from app.config import settings
    from app.indexer import EventConsumer

    consumer = EventConsumer(settings().redis_url, state.indexer)

    async def run():
        await consumer.ensure_group()
        fake.products.append(
            {
                "id": "p-lamp",
                "slug": "desk-lamp",
                "title": "LED Desk Lamp",
                "description": "Adjustable desk lamp with warm LED light.",
                "brand": None,
                "category": "home",
                "subcategory": "home-decoration",
                "tags": ["lamp"],
                "storeId": STORE,
                "storeName": "Casa Viva",
                "priceUsd": 2999,
                "status": "active",
            }
        )
        event = {"id": "evt-1", "type": "product.published", "data": {"productId": "p-lamp"}}
        await consumer.handle([("1-0", {"event": json.dumps(event)})])
        # The same event again is ignored (idempotency key).
        await consumer.handle([("1-1", {"event": json.dumps(event)})])
        fake.products[-1]["status"] = "archived"
        gone = {"id": "evt-2", "type": "product.unpublished", "data": {"productId": "p-lamp"}}
        found = await state.store.get("p-lamp")
        await consumer.handle([("1-2", {"event": json.dumps(gone)})])
        await consumer.handle([("1-3", {"event": "{broken"})])
        dlq = await consumer.redis.xlen("mercadia:events:dlq")
        await consumer.redis.aclose()
        return found, await state.store.get("p-lamp"), dlq

    found, after, dlq = client.portal.call(run)
    assert found["title"] == "LED Desk Lamp"
    assert after is None
    assert dlq == 1
    fake.products.pop()
