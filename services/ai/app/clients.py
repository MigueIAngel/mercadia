"""HTTP clients for the data the AI service reads from other services.

Product data comes from catalog (never from its database). Calls made on behalf of a user
(their orders, their wishlist) forward the user's own access token, so the owning service
applies its usual authorization.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from .config import Settings

log = logging.getLogger("ai.clients")

# Tests swap the network for an httpx.MockTransport that fakes the other services.
transport_override: httpx.AsyncBaseTransport | None = None


class Services:
    def __init__(self, cfg: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self.cfg = cfg
        self.http = httpx.AsyncClient(timeout=8.0, transport=transport or transport_override)
        self._rate: tuple[float, float] | None = None

    async def close(self) -> None:
        await self.http.aclose()

    async def _get(self, url: str, token: str | None = None, internal: bool = False) -> Any:
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if internal:
            headers["x-internal-key"] = self.cfg.internal_key
        try:
            res = await self.http.get(url, headers=headers)
        except httpx.HTTPError as error:
            log.warning("GET %s failed: %s", url, error)
            return None
        if res.status_code >= 400:
            log.info("GET %s -> %s", url, res.status_code)
            return None
        return res.json()

    # ----- catalog -----

    async def export_products(self, ids: list[str] | None = None) -> list[dict]:
        query = f"?ids={','.join(ids)}" if ids else ""
        rows = await self._get(
            f"{self.cfg.catalog_url}/internal/products/export{query}", internal=True
        )
        return rows or []

    async def products_by_ids(self, ids: list[str], currency: str = "COP") -> list[dict]:
        """Display-ready summaries (price in the viewer's currency), in the order given."""
        if not ids:
            return []
        try:
            res = await self.http.post(
                f"{self.cfg.catalog_url}/products/by-ids",
                json={"ids": ids, "currency": currency},
            )
            rows = res.json() if res.status_code < 400 else []
        except httpx.HTTPError as error:
            log.warning("by-ids failed: %s", error)
            rows = []
        by_id = {r["id"]: r for r in rows}
        return [by_id[i] for i in ids if i in by_id]

    async def product(self, slug: str, currency: str = "COP") -> dict | None:
        return await self._get(f"{self.cfg.catalog_url}/products/{slug}?currency={currency}")

    async def usd_to_cop(self) -> float:
        now = time.monotonic()
        if self._rate and now - self._rate[1] < 3600:
            return self._rate[0]
        res = await self._get(f"{self.cfg.catalog_url}/currency/rates")
        rate = float(((res or {}).get("rates") or {}).get("COP") or 4000)
        self._rate = (rate, now)
        return rate

    async def bestsellers(self, currency: str = "COP", limit: int = 8) -> list[dict]:
        res = await self._get(
            f"{self.cfg.catalog_url}/products?sort=bestselling&limit={limit}&currency={currency}"
        )
        return (res or {}).get("items", [])

    # ----- on behalf of the user -----

    async def my_orders(self, token: str) -> list[dict]:
        res = await self._get(f"{self.cfg.orders_url}/orders", token=token)
        if isinstance(res, dict):
            return res.get("items", [])
        return res or []

    async def wishlist_ids(self, token: str) -> list[str]:
        return await self._get(f"{self.cfg.engagement_url}/wishlist/ids", token=token) or []

    async def track(self, tracking_number: str) -> dict | None:
        return await self._get(
            f"{self.cfg.fulfillment_url}/shipments/track/{tracking_number.strip().upper()}"
        )
