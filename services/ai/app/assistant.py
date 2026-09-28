"""Shopping assistant.

With a Gemini key it is an LLM agent with function calling: the model decides when to search
the catalog, open a product, find similar items, list the user's orders or track a shipment,
and it may only recommend products that a tool returned. Without a key (or if Gemini fails)
a rule-based assistant answers the same intents with the same tools, so the demo always works.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any

from .auth import User
from .clients import Services
from .embeddings import normalize
from .search import SearchService

log = logging.getLogger("ai.assistant")

MAX_ROUNDS = 4
TRACKING = re.compile(r"\b(MC\d{8,12})\b", re.IGNORECASE)
ORDER_WORDS = re.compile(
    r"\b(pedido|pedidos|compra|compras|orden|ordenes|order|orders|purchase|purchases|envio|envios|"
    r"shipping|delivery|entrega|llega|llego)\b"
)
GREETING = re.compile(r"^(hola|buenas|buenos dias|buenas tardes|hi|hello|hey)[\s!.,]*$")

CATEGORIES = [
    "electronics",
    "home",
    "beauty",
    "fashion",
    "accessories",
    "groceries",
    "sports",
    "motor",
]


def money(amount: float, currency: str) -> str:
    """Formats minor units (cents or centavos, like every Mercadia API)."""
    if currency == "USD":
        return f"US${amount / 100:,.2f}"
    return "$ " + f"{amount / 100:,.0f}".replace(",", ".")


@dataclass
class Turn:
    role: str  # "user" | "assistant"
    text: str


@dataclass
class Context:
    user: User | None
    currency: str
    locale: str
    products: dict[str, dict] = field(default_factory=dict)
    tools_used: list[str] = field(default_factory=list)
    tracking: dict | None = None


class Tools:
    """The functions the assistant can call. Every result is JSON-serialisable."""

    def __init__(self, services: Services, search: SearchService):
        self.services = services
        self.search = search

    def _brief(self, p: dict, ctx: Context) -> dict:
        ctx.products.setdefault(p["id"], p)
        return {
            "id": p["id"],
            "slug": p["slug"],
            "title": p["title"],
            "brand": p.get("brand"),
            "price": money(p["price"], p.get("currency", ctx.currency)),
            "rating": p.get("rating", {}).get("avg"),
            "reviews": p.get("rating", {}).get("count"),
            "store": p.get("store", {}).get("name"),
            "inStock": p.get("inStock", True),
        }

    async def search_products(
        self,
        ctx: Context,
        query: str,
        max_price: float | None = None,
        min_price: float | None = None,
        category: str | None = None,
    ) -> dict:
        category = category if category in CATEGORIES else None
        # The model speaks in major units (pesos, dollars); the APIs use minor units.
        items = await self.search.search(
            query,
            ctx.currency,
            6,
            category,
            max_price * 100 if max_price else None,
            min_price * 100 if min_price else None,
        )
        return {"currency": ctx.currency, "results": [self._brief(p, ctx) for p in items]}

    async def get_product_details(self, ctx: Context, slug: str) -> dict:
        p = await self.services.product(slug, ctx.currency)
        if not p:
            return {"error": "not found"}
        brief = self._brief(p, ctx)
        variants = p.get("variants", [])
        return {
            **brief,
            "description": (p.get("description") or "")[:600],
            "options": p.get("options", []),
            "stock": sum(v.get("stock", 0) for v in variants),
            "specs": p.get("specs", {}),
            "compareAt": money(p["compareAt"], ctx.currency) if p.get("compareAt") else None,
        }

    async def similar_products(self, ctx: Context, product_id: str) -> dict:
        items = await self.search.similar(product_id, ctx.currency, 4)
        return {"results": [self._brief(p, ctx) for p in items]}

    async def my_orders(self, ctx: Context) -> dict:
        if not ctx.user:
            return {"error": "The user is not signed in. Ask them to sign in to see their orders."}
        orders = await self.services.my_orders(ctx.user.token)
        return {
            "orders": [
                {
                    "number": o.get("orderNumber") or o.get("number"),
                    "status": o.get("status"),
                    "total": money(float(o.get("total", 0)), o.get("currency", ctx.currency)),
                    "placedAt": str(o.get("createdAt", ""))[:10],
                    "items": [i.get("title") for i in o.get("items", [])][:4],
                }
                for o in orders[:5]
            ]
        }

    async def track_shipment(self, ctx: Context, tracking_number: str) -> dict:
        t = await self.services.track(tracking_number)
        if not t:
            return {"error": "tracking number not found"}
        ctx.tracking = t
        events = t.get("events", [])
        return {
            "trackingNumber": t.get("trackingNumber"),
            "carrier": t.get("carrier"),
            "status": t.get("status"),
            "destination": t.get("destinationCity"),
            "estimatedDelivery": str(t.get("estimatedDelivery", ""))[:10],
            "lastEvent": events[-1] if events else None,
        }

    async def call(self, ctx: Context, name: str, args: dict[str, Any]) -> dict:
        ctx.tools_used.append(name)
        fn = {
            "search_products": self.search_products,
            "get_product_details": self.get_product_details,
            "similar_products": self.similar_products,
            "my_orders": self.my_orders,
            "track_shipment": self.track_shipment,
        }.get(name)
        if not fn:
            return {"error": f"unknown tool {name}"}
        try:
            return await fn(ctx, **args)
        except TypeError as error:
            return {"error": f"bad arguments: {error}"}


FUNCTIONS = [
    {
        "name": "search_products",
        "description": (
            "Semantic search over the Mercadia catalog. Use it for any shopping need. The query "
            "should be a short description of the product in English or Spanish. Prices are in "
            "the shopper's currency, in whole pesos or dollars."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "What the shopper is looking for"},
                "max_price": {"type": "number", "description": "Maximum price, same currency"},
                "min_price": {"type": "number", "description": "Minimum price, same currency"},
                "category": {"type": "string", "enum": CATEGORIES},
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_product_details",
        "description": "Full details (description, options, stock, specs) of a product by slug.",
        "parameters": {
            "type": "object",
            "properties": {"slug": {"type": "string"}},
            "required": ["slug"],
        },
    },
    {
        "name": "similar_products",
        "description": "Products similar to a given product id (alternatives or complements).",
        "parameters": {
            "type": "object",
            "properties": {"product_id": {"type": "string"}},
            "required": ["product_id"],
        },
    },
    {
        "name": "my_orders",
        "description": "The signed-in shopper's recent orders with status and totals.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "track_shipment",
        "description": "Tracking status of a shipment by tracking number (e.g. MC0951562065).",
        "parameters": {
            "type": "object",
            "properties": {"tracking_number": {"type": "string"}},
            "required": ["tracking_number"],
        },
    },
]


def system_prompt(ctx: Context) -> str:
    language = "Spanish (Colombia)" if ctx.locale == "es" else "English"
    who = f"The shopper is signed in as {ctx.user.name}." if ctx.user else "The shopper is a guest."
    return (
        "You are Mercadia's shopping assistant, a Colombian multi-vendor marketplace. "
        f"Always answer in {language}, in a warm, concise tone (at most 5 short sentences or a "
        "short list). "
        f"{who} Prices are shown in {ctx.currency}; when the shopper gives a budget, pass it as "
        "max_price in whole units of that currency (e.g. '200 mil' = 200000 pesos, '$50' = 50). "
        "Only recommend products returned by your tools and never invent products, prices, "
        "stock or policies. Mention at most 4 products, each with its price. If nothing fits, "
        "say so and suggest a broader search. The product cards are shown below your message, "
        "so don't paste links. Payments are protected: the seller is paid when the order is "
        "delivered, and buyers can open a case from their order if something goes wrong. "
        "This is a demo store: payments use test cards and nothing is charged."
    )


class Assistant:
    def __init__(self, tools: Tools, api_key: str, model: str):
        self.tools = tools
        self.model = model
        self.client = None
        if api_key:
            from google import genai

            self.client = genai.Client(api_key=api_key)

    async def reply(
        self, history: list[Turn], message: str, user: User | None, currency: str, locale: str
    ) -> dict:
        ctx = Context(user=user, currency=currency, locale=locale)
        provider = "local"
        text = ""
        if self.client:
            try:
                text = await self._gemini(history, message, ctx)
                provider = "gemini"
            except Exception as error:  # quota, network, safety block…
                log.warning("Gemini failed, using the local assistant: %s", error)
                ctx = Context(user=user, currency=currency, locale=locale)
        if provider == "local":
            text = await self._local(message, ctx)
        return {
            "reply": text,
            "products": list(ctx.products.values())[:6],
            "tracking": ctx.tracking,
            "tools": ctx.tools_used,
            "provider": provider,
        }

    async def _gemini(self, history: list[Turn], message: str, ctx: Context) -> str:
        from google.genai import types

        contents: list[types.Content] = [
            types.Content(
                role="user" if t.role == "user" else "model",
                parts=[types.Part.from_text(text=t.text)],
            )
            for t in history[-10:]
        ]
        contents.append(types.Content(role="user", parts=[types.Part.from_text(text=message)]))
        config = types.GenerateContentConfig(
            system_instruction=system_prompt(ctx),
            temperature=0.4,
            max_output_tokens=700,
            tools=[
                types.Tool(
                    function_declarations=[
                        types.FunctionDeclaration(
                            name=f["name"],
                            description=f["description"],
                            parameters_json_schema=f["parameters"],
                        )
                        for f in FUNCTIONS
                    ]
                )
            ],
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        for _ in range(MAX_ROUNDS):
            res = await self.client.aio.models.generate_content(
                model=self.model, contents=contents, config=config
            )
            calls = res.function_calls or []
            if not calls:
                return (res.text or "").strip()
            contents.append(res.candidates[0].content)
            parts = []
            for call in calls:
                result = await self.tools.call(ctx, call.name, dict(call.args or {}))
                parts.append(
                    types.Part.from_function_response(
                        name=call.name, response={"result": json.loads(json.dumps(result))}
                    )
                )
            contents.append(types.Content(role="user", parts=parts))
        # Out of rounds: ask for a final answer without tools.
        final = await self.client.aio.models.generate_content(
            model=self.model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt(ctx), temperature=0.4, max_output_tokens=500
            ),
        )
        return (final.text or "").strip()

    # ----- rule-based fallback -----

    async def _local(self, message: str, ctx: Context) -> str:
        es = ctx.locale == "es"
        text = normalize(message).strip()

        if match := TRACKING.search(message):
            t = await self.tools.call(ctx, "track_shipment", {"tracking_number": match.group(1)})
            if "error" in t:
                return (
                    "No encontré esa guía. Revisa el número en el detalle de tu pedido."
                    if es
                    else "I couldn't find that tracking number. Check it on your order page."
                )
            last = (t.get("lastEvent") or {}).get("location", "")
            return (
                f"Tu envío {t['trackingNumber']} con {t['carrier']} está en estado "
                f"«{t['status']}»{f' (último punto: {last})' if last else ''}. "
                f"Entrega estimada: {t['estimatedDelivery']}."
                if es
                else f"Shipment {t['trackingNumber']} with {t['carrier']} is "
                f"'{t['status']}'{f' (last seen: {last})' if last else ''}. "
                f"Estimated delivery: {t['estimatedDelivery']}."
            )

        if ORDER_WORDS.search(text) and not re.search(r"\b(busco|quiero|recomienda)\b", text):
            res = await self.tools.call(ctx, "my_orders", {})
            if "error" in res:
                return (
                    "Para ver tus pedidos primero ingresa a tu cuenta."
                    if es
                    else "Please sign in to see your orders."
                )
            orders = res["orders"]
            if not orders:
                return "Aún no tienes pedidos." if es else "You have no orders yet."
            lines = [f"#{o['number']} · {o['status']} · {o['total']}" for o in orders[:3]]
            head = "Estos son tus pedidos recientes:" if es else "Your recent orders:"
            return head + "\n" + "\n".join(f"• {line}" for line in lines)

        if GREETING.match(text):
            return (
                "¡Hola! Soy el asistente de Mercadia. Cuéntame qué buscas y tu presupuesto, "
                "por ejemplo: «audífonos inalámbricos por menos de 200 mil»."
                if es
                else "Hi! I'm Mercadia's assistant. Tell me what you need and your budget, e.g. "
                "'wireless headphones under $50'."
            )

        query, max_price = extract_budget(message, ctx.currency)
        res = await self.tools.call(
            ctx, "search_products", {"query": query or message, "max_price": max_price}
        )
        # Without an LLM to judge relevance, keep only results close to the best match.
        scores = {i["id"]: ctx.products[i["id"]].get("score", 0) for i in res["results"]}
        best = max(scores.values(), default=0)
        items = [i for i in res["results"] if scores[i["id"]] >= max(0.6, best - 0.12)][:4]
        if not items:
            return (
                "No encontré productos que coincidan. Prueba con otras palabras o un presupuesto "
                "mayor."
                if es
                else "I couldn't find matching products. Try other words or a higher budget."
            )
        ctx.products = {i["id"]: ctx.products[i["id"]] for i in items}
        limit = money(max_price * 100, ctx.currency) if max_price else ""
        budget = f" por menos de {limit}" if max_price and es else ""
        budget_en = f" under {limit}" if max_price and not es else ""
        head = f"Encontré estas opciones{budget}:" if es else f"Here are some options{budget_en}:"
        lines = [f"• {i['title']} — {i['price']} ({i['store']})" for i in items]
        return head + "\n" + "\n".join(lines)


BUDGET = re.compile(
    r"(?:menos de|por menos de|maximo|max|hasta|no mas de|under|less than|below|up to|<)\s*"
    r"(?:us)?\$?\s*([\d.,]+)\s*(millon(?:es)?|mil|k|m)?\b",
    re.IGNORECASE,
)


def extract_budget(message: str, currency: str) -> tuple[str, float | None]:
    """'audífonos por menos de 200 mil' → ('audífonos', 200000): whole units of the currency."""
    match = BUDGET.search(normalize(message))
    if not match:
        return message, None
    raw, unit = match.group(1), (match.group(2) or "").lower()
    if currency == "COP":
        number = float(raw.replace(".", "").replace(",", ""))
    else:
        number = float(raw.replace(",", ""))
    if unit in ("mil", "k"):
        number *= 1000
    elif unit.startswith("millon") or unit == "m":
        number *= 1_000_000
    query = BUDGET.sub(" ", normalize(message)).strip()
    return query, number
