"""Text embeddings for semantic search.

With a Gemini key the service uses `gemini-embedding-001`. Without one (local development,
CI, or when the free quota runs out) it falls back to a deterministic hashed bag of words and
character trigrams, with a small Spanish→English shopping lexicon so Spanish queries still
find the (mostly English) catalog. Each embedder writes to its own vector collection, so
switching providers never mixes incompatible vectors.
"""

from __future__ import annotations

import hashlib
import logging
import math
import re
import unicodedata
from typing import Protocol

log = logging.getLogger("ai.embeddings")

CATEGORY_NAMES: dict[str, tuple[str, str]] = {
    "electronics": ("electronics", "tecnologia"),
    "home": ("home kitchen", "hogar cocina casa"),
    "beauty": ("beauty", "belleza"),
    "fashion": ("fashion clothing", "moda ropa"),
    "accessories": ("watches jewellery", "relojes joyeria"),
    "groceries": ("groceries food", "mercado comida"),
    "sports": ("sports", "deportes"),
    "motor": ("motor vehicles", "motor vehiculos"),
    "smartphones": ("smartphones phone", "celulares celular telefono"),
    "laptops": ("laptops computer notebook", "portatiles portatil computador"),
    "tablets": ("tablets", "tabletas tableta"),
    "mobile-accessories": ("mobile accessories", "accesorios celular"),
    "furniture": ("furniture", "muebles"),
    "home-decoration": ("home decor decoration", "decoracion"),
    "kitchen-accessories": ("kitchen", "cocina"),
    "skin-care": ("skin care", "cuidado piel"),
    "fragrances": ("fragrances perfume", "perfumes perfume"),
    "mens-shirts": ("men shirts", "camisas hombre"),
    "tops": ("tops women", "blusas tops mujer"),
    "womens-dresses": ("dresses women", "vestidos mujer"),
    "mens-shoes": ("men shoes", "zapatos hombre"),
    "womens-shoes": ("women shoes", "zapatos mujer"),
    "womens-bags": ("bags women handbag", "bolsos bolso cartera mujer"),
    "mens-watches": ("men watches", "relojes hombre"),
    "womens-watches": ("women watches", "relojes mujer"),
    "womens-jewellery": ("jewellery jewelry women", "joyeria joyas mujer"),
    "sunglasses": ("sunglasses", "gafas sol lentes"),
    "sports-accessories": ("sports gear ball", "articulos deportivos balon"),
    "motorcycle": ("motorcycle motorbike", "motos moto"),
    "vehicle": ("vehicle car", "vehiculos carro auto"),
}

# Spanish shopping words → English catalog vocabulary (accents already stripped).
LEXICON: dict[str, str] = {
    "celular": "phone smartphone mobile",
    "telefono": "phone smartphone",
    "movil": "phone mobile",
    "portatil": "laptop notebook",
    "computador": "laptop computer",
    "computadora": "laptop computer",
    "tableta": "tablet",
    "audifonos": "headphones earphones earbuds",
    "auriculares": "headphones earphones",
    "cargador": "charger",
    "cable": "cable",
    "funda": "case cover",
    "estuche": "case",
    "reloj": "watch",
    "relojes": "watch watches",
    "gafas": "sunglasses glasses",
    "lentes": "sunglasses glasses",
    "zapatos": "shoes",
    "zapatillas": "sneakers shoes",
    "tenis": "sneakers shoes",
    "tacones": "heels",
    "camisa": "shirt",
    "camiseta": "shirt tshirt",
    "vestido": "dress",
    "bolso": "bag handbag",
    "cartera": "bag handbag",
    "mochila": "backpack bag",
    "perfume": "perfume fragrance",
    "fragancia": "fragrance perfume",
    "maquillaje": "makeup beauty",
    "labial": "lipstick",
    "pestanina": "mascara",
    "crema": "cream lotion",
    "piel": "skin",
    "anillo": "ring",
    "collar": "necklace",
    "aretes": "earrings",
    "pulsera": "bracelet",
    "joya": "jewellery jewelry",
    "mueble": "furniture",
    "muebles": "furniture",
    "cama": "bed",
    "sofa": "sofa couch",
    "silla": "chair",
    "mesa": "table",
    "lampara": "lamp",
    "espejo": "mirror",
    "planta": "plant",
    "decoracion": "decoration decor",
    "cocina": "kitchen",
    "sarten": "pan",
    "olla": "pot",
    "cuchillo": "knife",
    "plato": "plate",
    "vaso": "glass cup",
    "taza": "mug cup",
    "hielo": "ice",
    "cafe": "coffee",
    "fruta": "fruit",
    "carne": "meat",
    "pollo": "chicken",
    "pescado": "fish",
    "leche": "milk",
    "huevos": "eggs",
    "agua": "water",
    "jugo": "juice",
    "comida": "food",
    "mascota": "pet",
    "perro": "dog",
    "gato": "cat",
    "balon": "ball",
    "pelota": "ball",
    "raqueta": "racket",
    "bicicleta": "bike bicycle",
    "moto": "motorcycle",
    "carro": "car vehicle",
    "casco": "helmet",
    "hombre": "men mens man",
    "mujer": "women womens woman",
    "nino": "kids children",
    "regalo": "gift",
    "barato": "cheap affordable",
    "economico": "cheap affordable",
    "negro": "black",
    "blanco": "white",
    "rojo": "red",
    "azul": "blue",
    "verde": "green",
    "rosado": "pink",
    "gris": "gray grey",
    "dorado": "gold",
    "plateado": "silver",
    "cuero": "leather",
    "madera": "wood wooden",
    "inalambrico": "wireless",
    "gamer": "gaming",
    "juegos": "gaming games",
}

STOPWORDS = {
    # es
    "de", "la", "el", "los", "las", "un", "una", "unos", "unas", "y", "o", "en", "para", "por",
    "con", "sin", "que", "me", "mi", "algo", "busco", "quiero", "necesito", "tienen", "hay", "del",
    "al", "lo", "se", "es", "muy", "mas", "menos",
    # en
    "the", "a", "an", "and", "or", "of", "for", "with", "to", "in", "on", "is", "it", "this",
    "that", "i", "my", "want", "need", "looking", "some", "any",
}  # fmt: skip

TOKEN = re.compile(r"[a-z0-9]+")


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in text if not unicodedata.combining(c))


def tokens(text: str) -> list[str]:
    out: list[str] = []
    for word in TOKEN.findall(normalize(text)):
        if word in STOPWORDS or len(word) < 2:
            continue
        out.append(word)
        expansion = LEXICON.get(word) or (LEXICON.get(word[:-1]) if word.endswith("s") else None)
        if expansion:
            out.extend(expansion.split())
    return out


def stem(word: str) -> str:
    for suffix in ("es", "s"):
        if len(word) > 4 and word.endswith(suffix):
            return word[: -len(suffix)]
    return word


class Embedder(Protocol):
    name: str
    dims: int

    async def embed_documents(self, texts: list[str]) -> list[list[float]]: ...

    async def embed_query(self, text: str) -> list[float]: ...


class HashingEmbedder:
    """Deterministic, dependency-free embedding: signed feature hashing of words and trigrams."""

    name = "hash512"
    dims = 512

    def _bucket(self, feature: str) -> tuple[int, float]:
        digest = hashlib.blake2b(feature.encode(), digest_size=8).digest()
        value = int.from_bytes(digest, "little")
        return value % self.dims, 1.0 if (value >> 63) & 1 else -1.0

    def vector(self, text: str) -> list[float]:
        vec = [0.0] * self.dims
        for word in tokens(text):
            root = stem(word)
            index, sign = self._bucket(f"w:{root}")
            vec[index] += sign
            padded = f"#{root}#"
            for i in range(len(padded) - 2):
                index, sign = self._bucket(f"t:{padded[i : i + 3]}")
                vec[index] += 0.25 * sign
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self.vector(t) for t in texts]

    async def embed_query(self, text: str) -> list[float]:
        return self.vector(text)


class GeminiEmbedder:
    dims = 768

    def __init__(self, api_key: str, model: str):
        from google import genai

        self.client = genai.Client(api_key=api_key)
        self.model = model
        self.name = f"gemini{self.dims}"

    async def _embed(self, texts: list[str], task: str) -> list[list[float]]:
        from google.genai import types

        out: list[list[float]] = []
        for start in range(0, len(texts), 100):
            batch = texts[start : start + 100]
            res = await self.client.aio.models.embed_content(
                model=self.model,
                contents=batch,
                config=types.EmbedContentConfig(task_type=task, output_dimensionality=self.dims),
            )
            for emb in res.embeddings or []:
                values = list(emb.values or [])
                norm = math.sqrt(sum(v * v for v in values)) or 1.0
                out.append([v / norm for v in values])
        return out

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return await self._embed(texts, "RETRIEVAL_DOCUMENT")

    async def embed_query(self, text: str) -> list[float]:
        return (await self._embed([text], "RETRIEVAL_QUERY"))[0]


def product_text(p: dict) -> str:
    """What gets embedded for a product: the title and taxonomy weigh more than the description."""
    names = " ".join(
        " ".join(CATEGORY_NAMES.get(slug, (slug.replace("-", " "), "")))
        for slug in (p.get("category"), p.get("subcategory"))
        if slug
    )
    tags = " ".join(p.get("tags") or [])
    brand = p.get("brand") or ""
    title = p.get("title", "")
    return "\n".join(
        [
            f"{title}. {title}. {title}.",
            f"{brand} {brand}",
            f"{names} {names}",
            f"{tags} {tags}",
            (p.get("description") or "")[:1500],
        ]
    )


def make_embedder(api_key: str, model: str) -> Embedder:
    if api_key:
        log.info("using Gemini embeddings (%s)", model)
        return GeminiEmbedder(api_key, model)
    log.info("no GEMINI_API_KEY: using local hashed embeddings")
    return HashingEmbedder()
