"""The Gemini function-calling loop, with a scripted fake model (no network, no key)."""

from types import SimpleNamespace

from google.genai import types

from app.assistant import Assistant, Turn


class ScriptedModel:
    """First asks for a tool, then answers using what the tool returned."""

    def __init__(self):
        self.requests: list[list[types.Content]] = []

    async def generate_content(self, model, contents, config):
        self.requests.append(list(contents))
        if len(self.requests) == 1:
            call = types.FunctionCall(
                name="search_products", args={"query": "wireless earbuds", "max_price": 300000}
            )
            content = types.Content(role="model", parts=[types.Part(function_call=call)])
            return SimpleNamespace(
                function_calls=[call], candidates=[SimpleNamespace(content=content)], text=None
            )
        result = contents[-1].parts[0].function_response.response["result"]
        title = result["results"][0]["title"]
        return SimpleNamespace(function_calls=None, text=f"Te recomiendo {title}.")


class FakeTools:
    def __init__(self):
        self.calls = []

    async def call(self, ctx, name, args):
        self.calls.append((name, args))
        product = {"id": "p1", "title": "Beats Flex", "price": 1, "currency": "COP"}
        ctx.products["p1"] = product
        ctx.tools_used.append(name)
        return {"results": [{"id": "p1", "title": "Beats Flex", "price": "$ 199.960"}]}


async def test_gemini_calls_tools_and_answers_with_their_results():
    tools = FakeTools()
    assistant = Assistant(tools, "", "gemini-test")
    model = ScriptedModel()
    assistant.client = SimpleNamespace(aio=SimpleNamespace(models=model))

    res = await assistant.reply(
        [Turn("user", "hola"), Turn("assistant", "¡Hola! ¿Qué buscas?")],
        "audífonos por menos de 300 mil",
        None,
        "COP",
        "es",
    )

    assert res["provider"] == "gemini"
    assert res["reply"] == "Te recomiendo Beats Flex."
    assert tools.calls == [("search_products", {"query": "wireless earbuds", "max_price": 300000})]
    assert [p["id"] for p in res["products"]] == ["p1"]
    # History + message, then the model's call and our function response.
    first, second = model.requests
    assert [c.role for c in first] == ["user", "model", "user"]
    assert [c.role for c in second[-2:]] == ["model", "user"]


async def test_gemini_failure_falls_back_to_the_local_assistant():
    class Broken:
        async def generate_content(self, **_):
            raise RuntimeError("429 RESOURCE_EXHAUSTED")

    assistant = Assistant(FakeTools(), "", "gemini-test")
    assistant.client = SimpleNamespace(aio=SimpleNamespace(models=Broken()))
    res = await assistant.reply([], "hola", None, "COP", "es")
    assert res["provider"] == "local"
    assert res["reply"].startswith("¡Hola!")
