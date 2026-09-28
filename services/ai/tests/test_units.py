"""Pure functions: embeddings, budgets, money, copywriter template."""

import pytest

from app.assistant import extract_budget, money
from app.copywriter import Copywriter
from app.embeddings import HashingEmbedder, product_text, tokens
from app.search import to_usd_cents
from tests.conftest import PRODUCTS


def cosine(a, b):
    return sum(x * y for x, y in zip(a, b, strict=True))


def test_spanish_words_expand_to_catalog_vocabulary():
    assert {"phone", "smartphone"} <= set(tokens("Busco un celular barato"))
    assert "busco" not in tokens("Busco un celular")  # stopword
    assert "audifonos" in tokens("audífonos")  # accents stripped


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("celular", "p-phone"),
        ("audífonos inalámbricos", "p-earbuds"),
        ("sofá para la sala", "p-sofa"),
        ("perfume de mujer", "p-perfume"),
    ],
)
def test_local_embeddings_rank_the_right_product_first(query, expected):
    e = HashingEmbedder()
    q = e.vector(query)
    ranked = sorted(PRODUCTS, key=lambda p: -cosine(q, e.vector(product_text(p))))
    assert ranked[0]["id"] == expected


def test_vectors_are_normalised_and_deterministic():
    e = HashingEmbedder()
    v = e.vector("iPhone X")
    assert v == e.vector("iPhone X")
    assert abs(sum(x * x for x in v) - 1) < 1e-9
    assert len(v) == e.dims


@pytest.mark.parametrize(
    ("message", "currency", "query", "budget"),
    [
        ("audífonos por menos de 200 mil", "COP", "audifonos", 200_000),
        ("un portátil hasta 3 millones", "COP", "un portatil", 3_000_000),
        ("zapatos no mas de 150.000", "COP", "zapatos", 150_000),
        ("sunglasses under $49.5", "USD", "sunglasses", 49.5),
        ("una lámpara bonita", "COP", "una lámpara bonita", None),
    ],
)
def test_budget_extraction(message, currency, query, budget):
    assert extract_budget(message, currency) == (query, budget)


def test_money_formats_minor_units():
    assert money(2_000_000, "COP") == "$ 20.000"
    assert money(4999, "USD") == "US$49.99"


def test_price_filters_convert_to_usd_cents():
    assert to_usd_cents(20_000_000, "COP", 4000) == 5000  # $200.000 COP = US$50
    assert to_usd_cents(5000, "USD", 4000) == 5000


async def test_copywriter_template_uses_only_the_sellers_notes():
    out = await Copywriter("", "unused").write(
        "Lámpara de escritorio", "luz LED cálida; brazo ajustable, USB-C", "home", "Lumo",
        "friendly", "es",
    )  # fmt: skip
    assert out["provider"] == "local"
    assert out["title"] == "Lumo Lámpara de escritorio"
    assert out["bullets"] == ["Luz LED cálida", "Brazo ajustable", "USB-C"]
    assert "luz led cálida" in out["description"]
    assert "lampara" in out["tags"] or "lámpara" in out["tags"]
