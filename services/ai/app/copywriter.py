"""Seller copywriter: turns a product title and a few notes into a listing.

Gemini returns structured JSON (response schema), so the web form can fill its fields
directly. Without a key, a template writer produces a clean, honest listing from the notes.
"""

from __future__ import annotations

import json
import logging
import re

from .embeddings import CATEGORY_NAMES

log = logging.getLogger("ai.copywriter")

SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "Product title, max 80 characters"},
        "description": {"type": "string", "description": "2 short paragraphs, 60-120 words"},
        "bullets": {"type": "array", "items": {"type": "string"}, "maxItems": 5},
        "tags": {"type": "array", "items": {"type": "string"}, "maxItems": 8},
    },
    "required": ["title", "description", "bullets", "tags"],
}

TONES = {
    "professional": ("profesional y claro", "professional and clear"),
    "friendly": ("cercano y entusiasta", "friendly and upbeat"),
    "premium": ("elegante y aspiracional", "elegant and aspirational"),
}


def _notes(features: str) -> list[str]:
    parts = re.split(r"[\n;•]+|,(?![^()]*\))", features)
    return [p.strip(" -.") for p in parts if len(p.strip(" -.")) > 2][:6]


class Copywriter:
    def __init__(self, api_key: str, model: str):
        self.model = model
        self.client = None
        if api_key:
            from google import genai

            self.client = genai.Client(api_key=api_key)

    async def write(
        self,
        title: str,
        features: str,
        category: str | None,
        brand: str | None,
        tone: str,
        locale: str,
    ) -> dict:
        if self.client:
            try:
                return {**await self._gemini(title, features, category, brand, tone, locale),
                        "provider": "gemini"}  # fmt: skip
            except Exception as error:
                log.warning("Gemini copywriter failed, using template: %s", error)
        return {**self._template(title, features, category, brand, tone, locale),
                "provider": "local"}  # fmt: skip

    async def _gemini(self, title, features, category, brand, tone, locale) -> dict:
        from google.genai import types

        language = "Spanish (Colombia)" if locale == "es" else "English"
        voice = TONES.get(tone, TONES["professional"])[1]
        prompt = (
            f"Write a marketplace product listing in {language} with a {voice} tone.\n"
            f"Product: {title}\nBrand: {brand or '-'}\nCategory: {category or '-'}\n"
            f"Seller notes (the only facts you may use):\n{features or '-'}\n\n"
            "Rules: do not invent specifications, certifications, warranties or claims that are "
            "not in the notes; no emojis; no prices; tags are lowercase search keywords."
        )
        res = await self.client.aio.models.generate_content(
            model=self.model,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.7,
                max_output_tokens=800,
                response_mime_type="application/json",
                response_json_schema=SCHEMA,
            ),
        )
        data = json.loads(res.text or "{}")
        return {
            "title": str(data.get("title", title))[:120],
            "description": str(data.get("description", "")),
            "bullets": [str(b) for b in data.get("bullets", [])][:5],
            "tags": [str(t).lower() for t in data.get("tags", [])][:8],
        }

    def _template(self, title, features, category, brand, tone, locale) -> dict:
        es = locale == "es"
        notes = _notes(features)
        names = CATEGORY_NAMES.get(category or "", ("", ""))
        cat = (names[1] if es else names[0]).split(" ")[0] if category else ""
        clean = re.sub(r"\s+", " ", title).strip()
        full_title = f"{brand} {clean}" if brand and brand.lower() not in clean.lower() else clean
        if es:
            opening = {
                "friendly": f"¡Conoce {full_title}! Pensado para acompañarte todos los días.",
                "premium": f"{full_title}: diseño cuidado y calidad que se nota en cada detalle.",
            }.get(tone, f"{full_title}, una opción confiable para tu día a día.")
            body = (
                "Entre sus características destacan: " + "; ".join(n.lower() for n in notes) + "."
                if notes
                else "Revisa las fotos y las especificaciones para conocer todos sus detalles."
            )
            closing = (
                "Compra con pago protegido: el vendedor recibe el dinero cuando tu pedido llega."
            )
        else:
            opening = {
                "friendly": f"Meet {full_title}! Made to keep up with your everyday life.",
                "premium": f"{full_title}: refined design and quality you notice in every detail.",
            }.get(tone, f"{full_title}, a reliable choice for every day.")
            body = (
                "Highlights: " + "; ".join(n.lower() for n in notes) + "."
                if notes
                else "Check the photos and specifications for every detail."
            )
            closing = "Buy with protected payments: the seller is paid once your order arrives."
        words = {w for w in re.findall(r"[a-záéíóúñ0-9]+", f"{full_title} {cat}".lower())}
        tags = [w for w in words if len(w) > 2][:8]
        return {
            "title": full_title[:120],
            "description": f"{opening} {body}\n\n{closing}",
            "bullets": [n[0].upper() + n[1:] for n in notes][:5],
            "tags": sorted(tags),
        }
