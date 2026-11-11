from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager
from engine.cache import Memory, cache
from engine.context import context
from engine.crypto import crypto
from engine.error import Code, Fault
from engine.exception import exception
from engine.fs import file
from engine.http import Action, Answer, App, Channel, Form, Group, Layer, Limits, Next, Request, Response, Route, Router, Throttle
from engine.socket import Sockets
from engine.test import stage
from engine.translate import translate
from engine.token import token
from engine.validate import Shape
from typing import Any, ClassVar, cast, override
from pathlib import Path
import aiohttp, asyncio, pytest

class Signup(Shape):

    email : str
    age   : int = 18

async def deny ( request: Request ) -> None:

    if request.header("x-deny"): raise Fault(Code.FORBIDDEN, reason="guard")

async def hello ( request: Request ) -> Any:

    return Response.ok({ "hello": request.query("name", "world"), "locale": request.locale(), "actor": request.actor() })

async def signup ( request: Request, body: Signup ) -> Any:

    return Response.created(body.dump(), meta={ "ip": request.client() })

async def show ( request: Request, key: int ) -> Any:

    return { "key": key, "id": request.trace() }

async def boom ( request: Request ) -> Any:

    raise ValueError("unexpected")

async def nothing ( request: Request ) -> None:

    return None

async def stream ( request: Request ) -> Any:

    async def chunks () -> AsyncIterator[bytes]:

        yield b"a"
        yield b"b"

    return Response.stream(chunks(), "text/plain")

async def events ( request: Request ) -> Any:

    async def source () -> AsyncIterator[tuple[str, object]]:

        yield "tick", { "n": 1 }

    return Response.sse(source())

async def inspect ( request: Request ) -> Any:

    return {
        "input": request.input("name", "none"), "has": request.has("name"), "filled": request.filled("name", "zz"),
        "only": request.only("name", "n", "zz"), "flag": request.boolean("flag"), "cookie": request.cookie("sid", "no"),
        "agent": request.agent(), "referer": request.referer(), "secure": request.secure(), "fresh": request.fresh('W/"abc"'),
    }

async def export ( request: Request ) -> Any:

    body = Response.csv([[1, "a,b"], [2, "c"]], "report.csv", ["id", "name"])

    return Response.cached(body, 60, etag=Response.etag(body.body or b""))

async def stale ( request: Request ) -> Any:

    return Response.not_modified(Response.etag("same", weak=False)) if request.fresh(Response.etag("same", weak=False)) else Response.download(b"fresh", "x y.bin")

async def paged ( request: Request ) -> Any:

    page, limit = request.paging(limit=2)

    return Response.page([1, 2], 5, page, limit)

@pytest.fixture
async def served () -> AsyncIterator[tuple[App, str]]:

    crypto.setup([crypto.key("k1")])
    token.setup("http-test-secret-that-is-long-enough-0001", issuer="http")
    cache.use(Memory())

    opened: list[str] = []

    app = App("Test App", "1.2.3", Limits(body_bytes=2048), origins=["http://localhost:3000"])

    @asynccontextmanager
    async def resource () -> AsyncIterator[None]:

        opened.append("up")

        yield

        opened.append("down")

    app.lifecycle(resource)
    translate.setup({ "en": {}, "ar": { "codes": { "ok": "تم" } } })
    app.throttles(tight="2/1m")
    app.mount(
        Route.get("/hello", hello, "hello"),
        Group.of(
            "/v1",
            Route.post("/signup", signup, "signup").throttled("tight"),
            Route.get("/items/<key:int>", show, "show", summary="One item"),
            Route.get("/boom", boom, "boom").hide(),
            Route.delete("/nothing", nothing, "nothing"),
            Route.get("/stream", stream, "stream"),
            Route.get("/events", events, "events"),
            Route.get("/paged", paged, "paged"),
            Route.post("/inspect/<n:int>", inspect, "inspect"),
            Route.get("/export", export, "export"),
            Route.get("/stale", stale, "stale"),
            name="v1", guards=[deny], tags=["v1"],
        ),
    )

    async with app.listen() as url:

        assert opened == ["up"] and app.ready

        yield app, url

    translate.setup({ "en": {} })

    assert opened == ["up", "down"] and not app.ready

async def test_routes_envelopes_and_errors ( served: tuple[App, str] ) -> None:

    app, url = served

    async with aiohttp.ClientSession() as http:

        async with http.get(f"{url}/hello?name=x", headers={ "Accept-Language": "ar-EG,ar;q=0.9" }) as reply:

            body = await reply.json()

            assert reply.status == 200 and body["data"] == { "hello": "x", "locale": "ar", "actor": None } and body["code"] == "ok"
            assert body["meta"]["request_id"] == reply.headers["X-Request-Id"] and reply.headers["X-Content-Type-Options"] == "nosniff"

        pair = token.pair("user-7", "aiohttp|127.0.0.1")

        async with http.get(f"{url}/hello", headers={ "Authorization": f"Bearer {pair.access}", "User-Agent": "aiohttp", "X-Request-Id": "req-abc-1" }) as reply:

            body = await reply.json()

            assert body["data"]["actor"] == "user-7" and reply.headers["X-Request-Id"] == "req-abc-1"

        async with http.post(f"{url}/v1/signup", json={ "email": "a@b.co", "age": "30" }, headers={ "Origin": "http://localhost:3000" }) as reply:

            body = await reply.json()

            assert reply.status == 201 and body["data"] == { "email": "a@b.co", "age": 30 } and body["meta"]["ip"] == "127.0.0.1"
            assert reply.headers["Access-Control-Allow-Origin"] == "http://localhost:3000" and reply.headers["X-RateLimit-Remaining"] == "1"

        async with http.post(f"{url}/v1/signup", json={ "email": "a@b.co", "extra": 1 }) as reply:

            body = await reply.json()

            assert reply.status == 422 and body["code"] == "validation" and body["reason"] == "validate.shape" and "extra" in str(body["errors"])

        async with http.post(f"{url}/v1/signup", json={ "email": "c@d.co" }) as reply:

            body = await reply.json()

            assert reply.status == 429 and body["reason"] == "http.throttled" and reply.headers["Retry-After"]

        async with http.get(f"{url}/v1/items/42") as reply:

            body = await reply.json()

            assert body["data"]["key"] == 42 and body["data"]["id"] == reply.headers["X-Request-Id"]

        async with http.get(f"{url}/v1/items/abc") as reply:

            assert reply.status == 404

        async with http.get(f"{url}/v1/items/1", headers={ "X-Deny": "1" }) as reply:

            body = await reply.json()

            assert reply.status == 403 and body["reason"] == "guard"

        async with http.get(f"{url}/v1/boom") as reply:

            body = await reply.json()

            assert reply.status == 500 and body["code"] == "internal" and body["reason"] is None and body["message"] == "Something went wrong"

        async with http.delete(f"{url}/v1/nothing") as reply:

            assert reply.status == 204

        async with http.get(f"{url}/missing") as reply:

            body = await reply.json()

            assert reply.status == 404 and body["code"] == "not_found" and body["reason"] == "http.not_found"

        async with http.get(f"{url}/v1/stream") as reply:

            assert await reply.read() == b"ab" and reply.headers["Content-Type"].startswith("text/plain")

        async with http.get(f"{url}/v1/events") as reply:

            text = await reply.text()

            assert "event: tick" in text and 'data: {"n":1}' in text and reply.headers["Content-Type"].startswith("text/event-stream")

        async with http.get(f"{url}/v1/paged?page=2") as reply:

            body = await reply.json()

            assert body["meta"] == { "request_id": reply.headers["X-Request-Id"], "page": 2, "limit": 2, "total": 5, "pages": 3 }

        async with http.get(f"{url}/v1/paged?page=0") as reply:

            assert reply.status == 400

        async with http.post(f"{url}/v1/signup", data=b"x" * 5000) as reply:

            assert reply.status == 413

        async with http.get(f"{url}/openapi.json") as reply:

            spec = await reply.json()

            assert spec["info"] == { "title": "Test App", "version": "1.2.3", "description": "" }
            assert "/v1/items/{key}" in spec["paths"] and "/v1/boom" not in spec["paths"]
            assert spec["paths"]["/v1/signup"]["post"]["requestBody"]["content"]["application/json"]["schema"] == { "$ref": "#/components/schemas/Signup" }
            assert spec["components"]["schemas"]["Signup"]["properties"]["age"]["default"] == 18
            assert spec["paths"]["/v1/items/{key}"]["get"]["summary"] == "One item" and spec["paths"]["/v1/signup"]["post"]["x-throttle"] == "tight"

    assert app.url("v1.show", key=3) == "/v1/items/3" and app.url("hello", name="x") == "/hello?name=x"
    assert app.router.names() == (
        "hello", "v1.boom", "v1.events", "v1.export", "v1.inspect", "v1.nothing", "v1.paged", "v1.show", "v1.signup",
        "v1.stale", "v1.stream",
    )
    assert app.describe()["routes"] == 11 and len(app.routes()) == 11

    with pytest.raises(Fault): app.url("nothing")
    with pytest.raises(Fault): app.url("v1.show")
    with pytest.raises(Fault): app.mount(Route.get("/dup", hello, "hello"))
    with pytest.raises(Fault): Route.get("nope", hello)
    with pytest.raises(Fault): app.throttles(bad="x")
    with pytest.raises(Fault): Response.redirect("javascript:alert(1)")

async def test_cors_preflight_answers_only_allowed_origins ( served: tuple[App, str] ) -> None:

    _, url = served
    asked  = { "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "x-request-id, accept-language" }

    async with aiohttp.ClientSession() as http:

        async with http.options(f"{url}/hello", headers={ "Origin": "http://localhost:3000", **asked }) as reply:

            assert reply.status == 204
            assert reply.headers["Access-Control-Allow-Origin"] == "http://localhost:3000"
            assert "X-Request-Id" in reply.headers["Access-Control-Allow-Headers"]
            assert "GET" in reply.headers["Access-Control-Allow-Methods"] and reply.headers["Access-Control-Max-Age"] == "600"
            assert reply.headers["Vary"] == "Origin"

        async with http.options(f"{url}/hello", headers={ "Origin": "https://evil.test", **asked }) as reply:

            body = await reply.json()

            assert reply.status == 403 and body["reason"] == "http.origin"
            assert "Access-Control-Allow-Origin" not in reply.headers

        async with http.get(f"{url}/hello", headers={ "Origin": "http://localhost:3000" }) as reply:

            assert reply.headers["Access-Control-Allow-Origin"] == "http://localhost:3000"
            assert "X-Request-Id" in reply.headers["Access-Control-Expose-Headers"]

        async with http.get(f"{url}/hello", headers={ "Origin": "https://evil.test" }) as reply:

            assert reply.status == 200 and "Access-Control-Allow-Origin" not in reply.headers

def test_throttle_policies_and_resources () -> None:

    policy = Throttle.parse("100/1h:actor")

    assert (policy.limit, policy.window, policy.by) == (100, 3600.0, "actor")
    assert Throttle.parse("5").window == 60.0

    class Controller:

        async def index ( self, request: Request ) -> Any: ...

        async def show ( self, request: Request, key: str ) -> Any: ...

    group = Route.resource("/users", Controller(), "users")

    assert [route.name for route in group.walk()] == ["users.index", "users.show"] and group.count() == 2
    assert [route.methods for route in group.walk()] == [("GET",), ("GET",)]
    assert Route.get("/a/<id:uuid>/<x>", hello).params() == ("id", "x")
    assert Route.any("/x", hello).methods == ("GET", "POST", "PUT", "PATCH", "DELETE")
    assert Route.get("/x", hello).tagged("a").guarded(deny).tags == ("a",)

class Declined(Exception): ...

async def test_the_lifecycle_wraps_renders_refuses_and_drains ( tmp_path: Path ) -> None:

    order: list[str] = []

    async def outer ( request: Request, call: Next ) -> Answer:

        order.append("outer:in")

        answer = await call(request)

        order.append("outer:out")

        answer.headers["X-Outer"] = "1"

        return answer

    async def inner ( request: Request, call: Next ) -> Answer:

        order.append("inner")

        return await call(request)

    async def short ( request: Request, call: Next ) -> Answer:

        return Response.ok({ "short": True })

    async def item ( key: int ) -> Any:

        return { "key": key }

    async def declined () -> Any:

        raise Declined

    async def body ( data: Signup ) -> Any:

        return Response.created(data.dump(), location="/signups/1")

    async def page ( request: Request, fault: Fault ) -> Answer | None:

        return None if request.wants_json() else Response.html(f"<p>{fault.code.value}</p>", int(fault.status))

    async def locked ( request: Request ) -> None:

        if not request.actor(): raise Fault(Code.UNAUTHORIZED, reason="auth.missing")

    (tmp_path / "robots.txt").write_text("User-agent: *\nDisallow: /\n")
    (tmp_path / ".hidden").write_text("no")

    cache.use(Memory())
    exception.map(Declined, Code.PAYMENT_REQUIRED, "payment.declined")
    translate.setup({
        "en": { "reasons": { "payment.declined": "The card was declined" } },
        "ar": { "reasons": { "payment.declined": "رُفضت البطاقة" }, "codes": { "ok": "تم" } },
    })

    app = (
        App("Lifecycle", "2.0.0")
        .throttles(burst="5/1m")
        .middleware(outer)
        .routing(
            Route.get("/item/<key:int>", item, "item").through(inner).throttled("burst"),
            Route.get("/short", item, "short").through(Stamped(), short),
            Route.get("/declined", declined, "declined"),
            Route.post("/body", body, "body"),
            Route.get("/locked", item, "locked").guarded(locked),
            Channel.define("/socket", Sockets(), "socket").guarded(deny),
        )
        .render(Declined, page)
        .public(tmp_path)
    )

    try:

        async with app.listen() as url, aiohttp.ClientSession() as http:

            async with http.get(f"{url}/item/7", headers={ "Accept-Language": "ar" }) as reply:

                body_ = await reply.json()

                assert body_["data"] == { "key": 7 } and body_["message"] == "تم" and reply.headers["X-Outer"] == "1"
                assert order == ["outer:in", "inner", "outer:out"] and reply.headers["X-RateLimit-Limit"] == "5"

            async with http.get(f"{url}/short") as reply:

                assert (await reply.json())["data"] == { "short": True } and reply.headers["X-Layer"] == "stamped"

            async with http.get(f"{url}/declined", headers={ "Accept": "text/html" }) as reply:

                assert reply.status == 402 and await reply.text() == "<p>payment_required</p>"

            async with http.get(f"{url}/declined", headers={ "Accept": "application/json", "Accept-Language": "ar" }) as reply:

                body_ = await reply.json()

                assert reply.status == 402 and body_["reason"] == "payment.declined" and body_["message"] == "رُفضت البطاقة"

            async with http.post(f"{url}/body", data=b'{"email": "a@b.co"}', headers={ "Content-Type": "text/plain" }) as reply:

                assert reply.status == 415 and (await reply.json())["reason"] == "http.media"

            async with http.post(f"{url}/body", json={ "email": "a@b.co" }) as reply:

                assert reply.status == 201 and reply.headers["Location"] == "/signups/1"

            async with http.post(f"{url}/item/7") as reply:

                assert reply.status == 405 and "GET" in reply.headers["Allow"]

            async with http.get(f"{url}/locked") as reply:

                assert reply.status == 401 and reply.headers["WWW-Authenticate"] == "Bearer"

            async with http.get(f"{url}/robots.txt") as reply:

                assert reply.status == 200 and "Disallow" in await reply.text()

            async with http.get(f"{url}/.hidden") as reply:

                assert reply.status == 404

            with pytest.raises(aiohttp.WSServerHandshakeError) as refused:

                async with http.ws_connect(f"{url}/socket", headers={ "X-Deny": "1" }): ...

            assert refused.value.status == 403

            app.down(30)

            async with http.get(f"{url}/item/7") as reply:

                assert reply.status == 503 and reply.headers["Retry-After"] == "30"

            async with http.get(f"{url}/health") as alive, http.get(f"{url}/ready") as ready:

                assert alive.status == 200 and ready.status == 503

            app.up()

            async with http.get(f"{url}/ready") as ready:

                assert ready.status == 200

            spec = app.openapi()

            assert set(spec["paths"]["/item/{key}"]["get"]["responses"]) == { "2XX", "404", "422", "429", "default" }
            assert "415" in spec["paths"]["/body"]["post"]["responses"] and spec["paths"]["/locked"]["get"]["security"]
            assert spec["components"]["schemas"]["Envelope"]["required"][0] == "data"
            assert app.describe()["middleware"] == 1 and app.describe()["renderers"] == ["Declined"] and app.channels()

            with pytest.raises(Fault) as sealed: app.mount(Route.get("/late", item, "late"))

            assert sealed.value.reason == "http.sealed"

    finally:

        exception.clear()
        translate.setup({ "en": {} })

class Greeting(Form):

    carries : ClassVar[tuple[str, ...]] = ("locale",)
    rules   : ClassVar[Mapping[str, str]] = { "name": "required|max:5", "tone": "in:plain,warm" }
    reason  : ClassVar[str] = "greeting.name"

    name : str
    tone : str = "plain"

    @classmethod
    @override
    def prepare ( cls, data: dict[str, Any] ) -> dict[str, Any]:

        return { key: value.strip() if isinstance(value, str) else value for key, value in data.items() }

class Note(Form):

    body  : str
    count : int = 1

class Stamped(Layer):

    @override
    async def handle ( self, request: Request, call: Next ) -> Answer:

        answer = await call(request)

        answer.headers["X-Layer"] = "stamped"

        return answer

async def test_a_form_validates_before_the_controller_and_carries_only_what_it_names () -> None:

    seen: list[dict[str, Any]] = []

    async def greet ( name: str, tone: str, locale: str ) -> Any:

        seen.append({ "name": name, "tone": tone, "locale": locale })

        return { "message": f"{tone} {name}" }

    async def note ( body: str, count: int ) -> Any:

        return Response.created({ "body": body * count })

    translate.setup({ "en": {}, "ar": {} })

    app = App("Forms").routing(
        Route.get("/greet/<name>", Greeting.to(greet), "greet"),
        Route.post("/notes", Note.to(note), "notes"),
    )

    try:

        async with app.listen() as url, aiohttp.ClientSession() as http:

            async with http.get(f"{url}/greet/%20Ann%20?tone=warm", headers={ "Accept-Language": "ar" }) as reply:

                assert (await reply.json())["data"] == { "message": "warm Ann" } and seen == [{ "name": "Ann", "tone": "warm", "locale": "ar" }]

            async with http.get(f"{url}/greet/Annabel") as reply:

                body = await reply.json()

                assert reply.status == 422 and body["reason"] == "greeting.name" and list(body["errors"]) == ["name"]

            async with http.get(f"{url}/greet/Ann?tone=loud&extra=1") as reply:

                assert reply.status == 422 and set((await reply.json())["errors"]) == { "tone", "extra" }

            async with http.post(f"{url}/notes", json={ "body": "ab", "count": "2" }) as reply:

                assert reply.status == 201 and (await reply.json())["data"] == { "body": "abab" }

            async with http.post(f"{url}/notes", data=b"body=ab", headers={ "Content-Type": "application/x-www-form-urlencoded" }) as reply:

                assert reply.status == 415

            async with http.post(f"{url}/notes", json={ "count": 1 }) as reply:

                body = await reply.json()

                assert reply.status == 422 and body["reason"] == "validate.shape" and "body" in body["errors"]

        spec  = app.openapi()
        query = { param["name"]: param for param in spec["paths"]["/greet/{name}"]["get"]["parameters"] }

        assert query["name"]["in"] == "path" and query["tone"] == { "name": "tone", "in": "query", "required": False, "schema": { "type": "string", "default": "plain" } }
        assert spec["paths"]["/notes"]["post"]["requestBody"]["content"]["application/json"]["schema"] == { "$ref": "#/components/schemas/Note" }
        assert isinstance(Note.to(note), Action)

        class Wrong(Form):

            carries : ClassVar[tuple[str, ...]] = ("password",)

        with pytest.raises(Fault) as refused: Wrong.to(note)

        assert refused.value.reason == "http.carries"

    finally:

        translate.setup({ "en": {} })

async def test_request_helpers_and_cached_downloads ( served: tuple[App, str] ) -> None:

    _, url = served

    async with aiohttp.ClientSession() as http:

        headers = { "User-Agent": "tester", "Referer": "http://ref", "If-None-Match": 'W/"abc", "zzz"', "X-Forwarded-Proto": "https", "Cookie": "sid=s1" }

        async with http.post(url + "/v1/inspect/7?name=q&flag=yes", json={ "name": "body", "n": None }, headers=headers) as reply:

            data = (await reply.json())["data"]

        assert data["input"] == "body" and data["has"] and not data["filled"] and data["only"] == { "name": "body", "n": "7" }
        assert data["flag"] and data["cookie"] == "s1" and data["agent"] == "tester" and data["referer"] == "http://ref"
        assert data["secure"] and data["fresh"]

        async with http.get(url + "/v1/export") as reply:

            text = await reply.text()

            assert reply.status == 200 and text == 'id,name\r\n1,"a,b"\r\n2,c\r\n' and reply.headers["Content-Type"].startswith("text/csv")
            assert reply.headers["Content-Disposition"] == 'attachment; filename="report.csv"' and reply.headers["Cache-Control"] == "public, max-age=60"
            assert reply.headers["ETag"].startswith('W/"')

        async with http.get(url + "/v1/stale") as reply:

            assert reply.status == 200 and await reply.read() == b"fresh" and reply.headers["Content-Disposition"] == 'attachment; filename="x_y.bin"'

        async with http.get(url + "/v1/stale", headers={ "If-None-Match": Response.etag("same", weak=False) }) as reply:

            assert reply.status == 304 and reply.headers["ETag"] == Response.etag("same", weak=False)

async def test_admission_sheds_load_with_a_retry_hint () -> None:

    async def slow ( request: Request ) -> Any:

        await asyncio.sleep(0.2)

        return Response.ok({ "slow": True })

    app = App("Admit", limits=Limits(concurrency=1, admission_seconds=0.05), docs=False)

    app.mount(Route.get("/slow", slow, "slow"))

    async with app.listen() as url, aiohttp.ClientSession() as http:

        first = asyncio.ensure_future(http.get(f"{url}/slow"))

        await asyncio.sleep(0.03)

        async with http.get(f"{url}/slow") as reply:

            body = await reply.json()

            assert reply.status == 503 and body["code"] == "unavailable" and reply.headers["Retry-After"] == "1"

        held = await first

        assert held.status == 200 and (await held.json())["data"] == { "slow": True }

        held.release()

async def test_deferred_work_runs_after_the_answer_and_never_changes_it () -> None:

    seen: list[object] = []
    told: list[str] = []
    gate = asyncio.Event()

    async def slow () -> None:

        await gate.wait()

        seen.append(("slow", context.request_id()))

    def crash () -> None: raise ValueError("late")

    async def work ( request: Request ) -> Any:

        context.defer(lambda: seen.append(("first", context.request_id())))
        context.defer(crash)
        context.defer(slow)
        context.defer(lambda: seen.append(("always", context.request_id())), always=True)

        return Response.ok({ "id": request.trace() })

    async def refused ( request: Request ) -> Any:

        context.defer(lambda: seen.append("success only"))
        context.defer(lambda: seen.append(("kept", context.request_id())), always=True)

        raise Fault(Code.CONFLICT, reason="taken")

    async def quick ( request: Request ) -> Any:

        context.defer(lambda: seen.append(("inline", context.request_id())))
        context.defer(crash)

        return Response.ok({ "id": request.trace() })

    async def plain ( request: Request ) -> Any:

        held = context.deferred()

        return Response.ok({ "pending": held.pending() if held is not None else -1, "id": request.trace() })

    app = App("Defer", docs=False)

    app.mount(
        Route.get("/work", work, "work"), Route.get("/refused", refused, "refused"), Route.get("/quick", quick, "quick"),
        Route.get("/plain", plain, "plain"),
    )
    exception.report(lambda fault, error: told.append(f"{fault.code.value}:{type(error).__name__}"))

    try:

        async with app.listen() as url, aiohttp.ClientSession() as http:

            async with http.get(f"{url}/work") as reply:

                asked = reply.headers["X-Request-Id"]

                assert reply.status == 200 and (await reply.json())["data"] == { "id": asked }

            await asyncio.sleep(0.02)

            assert seen == [("first", asked)] and told == ["internal:ValueError"] and app.edge.later.count() == 1

            async with http.get(f"{url}/plain") as reply:

                body = await reply.json()

                assert body["data"]["pending"] == 0 and body["data"]["id"] != asked

            async with http.get(f"{url}/refused") as reply:

                failed = reply.headers["X-Request-Id"]

                assert reply.status == 409 and (await reply.json())["reason"] == "taken"

            await asyncio.sleep(0.02)

            assert seen == [("first", asked), ("kept", failed)] and told == ["internal:ValueError", "conflict:Fault"]

            app.edge.backlog = 1

            async with http.get(f"{url}/quick") as reply:

                crowded = reply.headers["X-Request-Id"]

                assert reply.status == 200 and (await reply.json())["data"] == { "id": crowded }
                assert seen[-1] == ("inline", crowded) and told[-1] == "internal:ValueError" and len(told) == 3

            async with http.get(f"{url}/plain") as reply:

                body = await reply.json()

                assert body["data"]["pending"] == 0 and body["data"]["id"] not in { asked, failed, crowded }

            assert app.edge.later.count() == 1

            asyncio.get_running_loop().call_later(0.05, gate.set)

        assert seen[-2:] == [("slow", asked), ("always", asked)] and app.edge.later.count() == 0 and len(told) == 3

    finally: exception.clear()

class Remark(Shape):

    body : str

@pytest.fixture
async def hardened ( tmp_path: Path ) -> AsyncIterator[str]:

    stage.wire()

    async def echo ( request: Request, note: Remark ) -> Any: return Response.ok({ "body": note.body })

    async def ping ( request: Request ) -> Any: return Response.ok({ "pong": True })

    await file.write(tmp_path / "public" / "ok.txt", b"fine")
    await file.write(tmp_path / "secret.txt", b"nope")

    app = App("Attack", limits=Limits(body_bytes=2048, header_bytes=2048), docs=False)

    app.throttles(tight="3/1m")
    app.mount(Route.post("/echo", echo, "echo"), Route.get("/ping", ping, "ping").throttled("tight"))
    app.public(tmp_path / "public", "/static")

    async with app.listen() as url: yield url

async def test_the_edge_refuses_oversized_malformed_and_traversing_requests ( hardened: str ) -> None:

    async with aiohttp.ClientSession() as http:

        async with http.post(f"{hardened}/echo", data=b'{"body": "' + b"x" * 4000 + b'"}', headers={ "Content-Type": "application/json" }) as big:

            assert big.status == 413

        async with http.get(f"{hardened}/ping", headers={ "X-Padding": "p" * 4000 }) as wide:

            assert wide.status in (400, 413, 431)

        async with http.post(f"{hardened}/echo", data=b'{"body": "a"', headers={ "Content-Type": "application/json" }) as cut:

            assert cut.status in (400, 422) and (await cut.json())["code"] in ("bad_request", "validation")

        nested = b"[" * 1500 + b"]" * 1500

        async with http.post(f"{hardened}/echo", data=nested, headers={ "Content-Type": "application/json" }) as deep:

            assert deep.status in (400, 413, 422)

        async with http.post(f"{hardened}/echo", data=b'{"body": "\xff\xfe"}', headers={ "Content-Type": "application/json" }) as broken:

            assert broken.status in (400, 422)

        async with http.post(f"{hardened}/echo", data=b'{"body": "x", "evil": 1}', headers={ "Content-Type": "application/json" }) as extra:

            assert extra.status == 422 and "evil" in str((await extra.json())["errors"])

        async with http.post(f"{hardened}/echo", data=b'{"body": "x"}', headers={ "Content-Type": "text/plain" }) as media:

            assert media.status == 415

        async with http.get(f"{hardened}/static/ok.txt") as fine:

            assert fine.status == 200 and await fine.read() == b"fine"

        for path in ("/static/../secret.txt", "/static/..%2fsecret.txt", "/static/%2e%2e/secret.txt", "/static/ok.txt%00"):

            async with http.get(f"{hardened}{path}", allow_redirects=False) as sneaky:

                assert sneaky.status in (400, 404) and b"nope" not in await sneaky.read()

        statuses = []

        for _ in range(5):

            async with http.get(f"{hardened}/ping") as hit: statuses.append(hit.status)

        assert statuses[:3] == [200, 200, 200] and statuses[3:] == [429, 429]

        async with http.get(f"{hardened}/ping") as throttled:

            assert throttled.headers["Retry-After"] and throttled.headers["X-Content-Type-Options"] == "nosniff"
            assert throttled.headers["X-Frame-Options"] == "DENY" and throttled.headers["Cache-Control"] == "no-store"

        async with http.request("TRACE", f"{hardened}/ping") as odd:

            assert odd.status in (404, 405)

        async with http.get(f"{hardened}/ping", headers={ "X-Request-Id": "<script>alert(1)</script>" }) as forged:

            assert forged.status == 429 and len(forged.headers["X-Request-Id"]) == 16 and "<" not in forged.headers["X-Request-Id"]

def test_the_surface_refuses_what_a_misconfigured_app_could_do () -> None:

    for field, value in (
        ("body_bytes", 0), ("header_bytes", -1), ("request_seconds", 0), ("response_seconds", 1.5), ("keepalive_seconds", True),
        ("shutdown_seconds", "10"), ("socket_bytes", 0), ("concurrency", -1), ("concurrency", 2.0), ("admission_seconds", 0),
        ("admission_seconds", 3601), ("admission_seconds", float("nan")), ("admission_seconds", True),
    ):

        with pytest.raises(Fault) as wrong: Limits(**{ field: cast("Any", value) })

        assert wrong.value.reason == "http.limits", field

    assert Limits(concurrency=0, admission_seconds=0.5).admission_seconds == 0.5

    for reason, make in (
        ("route.path", lambda: Route.get("nope", hello)), ("route.path", lambda: Route.get("/a b", hello)), ("route.path", lambda: Route.get("/a\nb", hello)),
        ("route.path", lambda: Route.get(cast("Any", None), hello)), ("route.handler", lambda: Route.get("/x", cast("Any", "hello"))),
        ("route.name", lambda: Route.get("/x", hello, "")), ("route.name", lambda: Route.get("/x", hello, "n" * 129)), ("route.name", lambda: Route.get("/x", hello, cast("Any", 7))),
        ("route.method", lambda: Route.match((), "/x", hello)), ("route.method", lambda: Route.match(("TRACE",), "/x", hello)),
        ("route.method", lambda: Route.match(("GET", "get"), "/x", hello)), ("route.method", lambda: Route.match(cast("Any", (1,)), "/x", hello)),
        ("group.prefix", lambda: Group.of("v1", Route.get("/x", hello))), ("group.prefix", lambda: Group.of("/v 1")), ("group.prefix", lambda: Group.of(cast("Any", None))),
        ("throttle.policy", lambda: Throttle.parse("5/1m:tenant")), ("throttle.policy", lambda: Throttle.parse("0/1m")), ("throttle.policy", lambda: Throttle.parse("x")),
        ("throttle.policy", lambda: Throttle.parse("5/0s")), ("throttle.policy", lambda: Throttle.parse(cast("Any", 5))), ("throttle.policy", lambda: Throttle.parse("")),
        ("http.redirect", lambda: Response.redirect("//evil.test/x")), ("http.redirect", lambda: Response.redirect("/\\evil.test")),
        ("http.redirect", lambda: Response.redirect("/ok\r\nSet-Cookie: a=b")), ("http.redirect", lambda: Response.redirect(cast("Any", None))),
        ("http.cache", lambda: Response.cached(Response.ok(), -1)), ("http.cache", lambda: Response.cached(Response.ok(), cast("Any", 1.5))),
    ):

        with pytest.raises(Fault) as refused: make()

        assert refused.value.reason == reason, reason

    assert Route.match(("get", "post"), "/x", hello).methods == ("GET", "POST") and Route.match(("HEAD", "OPTIONS"), "/x", hello).methods == ("HEAD", "OPTIONS")
    assert [route.path for route in Group.of("/v1/", Route.get("/", hello), Route.get("/x", hello)).walk()] == ["/v1", "/v1/x"]
    assert [route.path for route in Group.of("", Route.get("/", hello)).walk()] == ["/"]
    assert Group.of("", Route.get("/", hello), name="shop").tags == ("shop",) and Group.of("", Route.get("/", hello), name="shop", tags=("a",)).tags == ("a",)
    assert Group.of("", Route.get("/", hello)).tags == () and Note.prepare({ "body": "  hi ", "count": 1, "raw": b" x " }) == { "body": "hi", "count": 1, "raw": b" x " }
    assert Response.redirect("/ok").headers["Location"] == "/ok" and Response.redirect("https://ok.test/a?b=c").status == 307
    assert Response.cached(Response.ok(), 0).headers["Cache-Control"] == "no-store"

    router = Router()

    router.register(Route.get("/users/<key>/posts/<slug>", hello, "posts"))

    assert router.url("posts", key="a/b c", slug="ñ", page=2, q="x&y=1", empty=None) == "/users/a%2Fb%20c/posts/%C3%B1?page=2&q=x%26y%3D1"
    assert router.url("posts", key=1, slug="s") == "/users/1/posts/s"

async def test_a_handler_with_spread_parameters_is_still_bound () -> None:

    async def spread ( request: Request, key: int, *rest: Any, **extra: Any ) -> Any:

        return { "key": key, "rest": list(rest), "extra": extra }

    app = App("Spread", docs=False)

    app.mount(Route.get("/item/<key:int>", spread, "item"))

    async with app.listen() as url, aiohttp.ClientSession() as http, http.get(f"{url}/item/3?x=1") as reply:

        assert reply.status == 200 and (await reply.json())["data"] == { "key": 3, "rest": [], "extra": {} }
