from collections.abc import Callable
from functools import partial
from typing import Any, cast

from engine.cache import Memory, cache
from engine.database import database
from engine.error import Code, Fault
from engine.health import health
from engine.http import Request, Response, Route
from engine.metric import MEDIA, metrics
from engine.test import Bench, Client, Reply, Sample, Stage, stage
import pytest, time

def refused ( work: Callable[[], object], reason: str, word: str ) -> Fault:

    with pytest.raises(Fault) as caught: work()

    assert caught.value.code is Code.INTERNAL and caught.value.reason == f"test.{reason}"
    assert caught.value.errors == { reason: [word] }

    return caught.value

def clocked ( monkeypatch: pytest.MonkeyPatch, spans: list[int] ) -> None:

    ticks = [0]

    for span in spans: ticks.extend((ticks[-1] + span, ticks[-1] + span + 7))

    turns = iter(ticks)

    monkeypatch.setattr(time, "perf_counter_ns", partial(next, turns))

async def test_the_stage_serves_health_ready_metrics_and_routes () -> None:

    stage.wire()

    async def hello ( request: Request ) -> Any: return Response.ok({ "hi": request.query("name", "world") })

    async def broken ( request: Request ) -> Any: raise Fault(Code.CONFLICT, reason="taken")

    app = stage.application(Route.get("/hello", hello, "hello"), Route.post("/broken", broken, "broken"))

    async with stage.client(app) as client:

        live = client.expect(await client.get("/health"), 200, "ok")

        assert live.data()["status"] == "ok" and live.ok() and "uptime" in live.data()

        ready = await client.get("/ready")

        assert ready.status == 200 and ready.data()["status"] == "ok"
        assert live.data()["service"] == "Stage" and live.data()["version"] == "0.0.0"

        async def failing () -> bool: return False

        health.register("broken", failing)

        degraded = client.expect(await client.get("/ready"), 503, "unavailable")

        assert degraded.reason() is None and degraded.errors() is None and health.forget("broken")
        assert not degraded.ok() and degraded.message() == "The service is unavailable"

        hello_reply = await client.get("/hello", name="x")

        assert hello_reply.data() == { "hi": "x" } and hello_reply.header("X-Request-Id")
        assert hello_reply.header("x-request-id") == hello_reply.headers["x-request-id"]

        refused = client.expect(await client.post("/broken", { "a": 1 }), 409, "conflict", "taken")

        assert refused.errors() is None and refused.reason() == "taken" and refused.data() is None

        metrics.counter("stage_hits", "Hits").inc(2, route="hello")

        exposition = await client.get("/metrics")

        assert metrics.forget("stage_hits") and exposition.status == 200 and exposition.data() is None
        assert exposition.header("content-type") == MEDIA and isinstance(exposition.body, str)
        assert "# HELP engine_stage_hits_total Hits\n# TYPE engine_stage_hits_total counter\n" in exposition.body
        assert 'engine_stage_hits_total{route="hello"} 2\n' in exposition.body and exposition.body.endswith("\n")

        bare = await client.get("/metrics")

        assert bare.status == 200 and bare.header("content-type") == MEDIA and "stage_hits" not in str(bare.body)

        with pytest.raises(Fault) as wrong: client.expect(hello_reply, 201)

        assert wrong.value.reason == "test.status" and wrong.value.message.startswith("expected 201, got 200: {")

        with pytest.raises(Fault) as coded: client.expect(refused, 409, "ok")

        assert coded.value.reason == "test.code" and coded.value.message == "expected code ok, got conflict"

        with pytest.raises(Fault) as worded: client.expect(refused, 409, "conflict", "other")

        assert worded.value.reason == "test.reason" and worded.value.message == "expected reason other, got taken"

        authed = client.bearer("abc").header("X-Test", "1")

        assert (await authed.get("/hello")).status == 200 and authed is not client

    assert stage.database_url().startswith("postgresql://") and stage.redis_url().startswith("redis://") and stage.amqp_url().startswith("amqp://")

    cache.use(Memory())

async def test_the_client_speaks_every_verb_and_shows_what_came_back () -> None:

    stage.wire()

    async def echo ( request: Request ) -> Any:

        sent = {
            "method" : request.method,
            "query"  : { name: request.args.getlist(name) for name in ("tag", "on", "n") },
            "type"   : request.header("content-type"),
            "auth"   : request.header("authorization"),
            "mark"   : request.header("x-mark"),
            "body"   : request.body.decode(),
        }

        return Response.ok(sent, "echoed", { "page": 1 })

    async def moved ( request: Request ) -> Any: return Response.redirect("/echo")

    async def plain ( request: Request ) -> Any: return Response.text("just text")

    async def nothing ( request: Request ) -> Any: return Response.empty()

    verbs = ("GET", "POST", "PUT", "PATCH", "DELETE")
    app   = stage.application(
        Route.match(verbs, "/echo", echo, "echo"), Route.get("/moved", moved, "moved"),
        Route.match(("GET", "HEAD"), "/plain", plain, "plain"), Route.delete("/nothing", nothing, "nothing"),
        origins=("https://app.example.com",),
    )

    async with stage.client(app, { "X-Mark": "m" }) as client:

        got = client.expect(await client.get("/echo", tag=["a", "b"], on=True, n=5, skip=None), 200, "ok")

        assert got.data()["method"] == "GET" and got.data()["query"] == { "tag": ["a", "b"], "on": ["true"], "n": ["5"] }
        meta = got.meta() or {}

        assert got.message() == "echoed" and meta["page"] == 1 and got.data()["mark"] == "m"
        assert meta["request_id"] == got.header("X-Request-Id")
        assert got.data()["type"] is None and got.data()["auth"] is None and got.data()["body"] == ""

        for verb, send in (("POST", client.post), ("PUT", client.put), ("PATCH", client.patch)):

            sent = (await send("/echo", { "a": [1, "س"] })).data()

            assert sent["method"] == verb and sent["type"] == "application/json" and sent["body"] == '{"a":[1,"س"]}'

        assert (await client.post("/echo")).data()["body"] == "" and (await client.delete("/echo")).data()["method"] == "DELETE"

        typed = client.header("Content-Type", "application/x-ndjson").bearer("abc")
        raw   = await typed.call("POST", "/echo", raw=b"{}\n{}", query={ "n": 2 })

        assert raw.data()["type"] == "application/x-ndjson" and raw.data()["body"] == "{}\n{}" and raw.data()["auth"] == "Bearer abc"
        assert raw.data()["query"]["n"] == ["2"] and (await typed.post("/echo", { "x": 1 })).data()["type"] == "application/x-ndjson"
        assert (await client.get("/echo")).data()["auth"] is None

        went = await client.get("/moved")

        assert went.status == 307 and went.header("Location") == "/echo" and went.body is None and not went.ok()

        text = await client.get("/plain")

        assert text.body == "just text" and text.code() is None and text.errors() is None and text.meta() is None

        gone = await client.delete("/nothing")

        assert gone.status == 204 and gone.body is None and gone.ok() and gone.reason() is None

        head = await client.head("/plain", n=1)

        assert head.status == 200 and head.body is None and head.header("content-type") == "text/plain; charset=utf-8"

        asked = await client.header("Origin", "https://app.example.com").header("Access-Control-Request-Method", "POST").options("/echo")

        assert asked.status == 204 and asked.header("access-control-allow-origin") == "https://app.example.com"
        assert (await client.get("/missing")).code() == "not_found" and all(name == name.lower() for name in got.headers)

        for path, word in (("echo", "echo"), ("", ""), (5, "int"), (None, "NoneType"), (b"/echo", "bytes"), ("e" * 200, "e" * 128)):

            with pytest.raises(Fault) as stray: await client.call("GET", cast("Any", path))

            assert stray.value.reason == "test.path" and stray.value.errors == { "path": [word] }

        with pytest.raises(Fault) as twice: await client.call("POST", "/echo", { "a": 1 }, raw=b"x")

        assert twice.value.reason == "test.body" and twice.value.errors == { "body": ["bytes"] }

    cache.use(Memory())

def test_the_client_refuses_a_base_it_cannot_reach () -> None:

    for base, word in (("", ""), ("127.0.0.1:80", "127.0.0.1:80"), ("ftp://x", "ftp://x"), (5, "int"), (None, "NoneType"), (b"http://x", "bytes")):

        refused(partial(Client, cast("Any", base)), "base", word)

    refused(partial(Client, "HTTP://x"), "base", "HTTP://x")
    refused(partial(Client, "h" * 200), "base", "h" * 128)

    client = Client("https://x.example.com///", { "A": "1" })
    reply  = Reply(418, { "code": "teapot", "reason": "short", "errors": { "a": ["b"] } }, { "x-a": "1" })

    assert client.expect(reply, 418, "teapot", "short") is reply and client.expect(reply, 418) is reply
    assert client.header("B", "2") is not client and Client("http://x").expect(Reply(200, None), 200).body is None

    with pytest.raises(Fault) as long: client.expect(Reply(500, "x" * 5000), 200)

    assert long.value.message == "expected 200, got 500: " + "x" * 512

    with pytest.raises(Fault) as bare: client.expect(Reply(200, ["ok"]), 200, "ok")

    assert bare.value.message == "expected code ok, got None"

    with pytest.raises(Fault) as blank: client.expect(Reply(200, { "code": "ok" }), 200, "ok", "why")

    assert blank.value.message == "expected reason why, got None"

def test_replies_read_the_envelope_or_nothing () -> None:

    full = Reply(200, { "code": "ok", "message": "m", "reason": "r", "errors": { "a": ["b"] }, "data": [1], "meta": { "p": 1 } })

    assert (full.code(), full.message(), full.reason(), full.errors(), full.data(), full.meta()) == ("ok", "m", "r", { "a": ["b"] }, [1], { "p": 1 })

    for body in (None, "text", b"raw", 5, ["code"], ("data",), 1.5, True):

        bare = Reply(200, body)

        assert bare.data() is None and bare.code() is None and bare.message() is None and bare.reason() is None
        assert bare.errors() is None and bare.meta() is None and bare.headers == {}

    assert Reply(200, {}).data() is None and Reply(200, { "data": 0 }).data() == 0 and Reply(200, { "data": None }).data() is None
    assert [Reply(status, None).ok() for status in (199, 200, 204, 299, 300, 404, 500)] == [False, True, True, True, False, False, False]

    headed = Reply(200, None, { "x-request-id": "1", "content-type": "text/plain" })

    assert headed.header("X-Request-Id") == "1" and headed.header("CONTENT-TYPE") == "text/plain" and headed.header("etag") is None
    assert all(headed.header(cast("Any", name)) is None for name in (None, 5, b"etag", ["etag"]))
    assert Reply(200, None).headers is not Reply(200, None).headers

    with pytest.raises(AttributeError): cast("Any", headed).status = 500

def test_bench_reads_exact_quantiles_from_the_clock ( monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str] ) -> None:

    bench = Bench(rounds=100, warm=3)
    calls = [0]

    def work () -> None: calls[0] += 1

    clocked(monkeypatch, [(index * 37 % 100 + 1) * 1000 for index in range(100)])

    sample = bench.measure("spread", work)

    assert calls == [103] and sample == Sample("spread", 100, 51.0, 96.0, 100.0, 1.0, 100.0)
    assert sample.line() == "spread  p50=51.00µs  p95=96.00µs  p99=100.00µs  min=1.00µs  max=100.00µs  n=100"
    assert capsys.readouterr().out == sample.line() + "\n"

    clocked(monkeypatch, [3000, 1000, 2000])

    assert bench.measure("three", work, 3) == Sample("three", 3, 2.0, 3.0, 3.0, 1.0, 3.0) and calls == [109]

    clocked(monkeypatch, [1500])

    assert bench.measure("one", work, 1) == Sample("one", 1, 1.5, 1.5, 1.5, 1.5, 1.5)

    clocked(monkeypatch, [index * 1000 for index in range(1, 21)])

    assert bench.measure("twenty", work, 20) == Sample("twenty", 20, 11.0, 20.0, 20.0, 1.0, 20.0)

    capsys.readouterr()
    monkeypatch.undo()

    assert [sample.name for sample in bench.samples()] == ["spread", "three", "one", "twenty"]
    assert bench.dump()[1] == { "name": "three", "rounds": 3, "p50": 2.0, "p95": 3.0, "p99": 3.0, "low": 1.0, "high": 3.0 }
    assert bench.samples() is not bench.samples()

    bench.print()

    assert capsys.readouterr().out.splitlines() == [sample.line() for sample in bench.samples()]

    bench.clear()

    assert bench.samples() == [] and bench.dump() == []

    bench.print()

    assert capsys.readouterr().out == ""

def test_bench_measures_async_work_on_its_own_share ( monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str] ) -> None:

    quiet = Bench(rounds=200, warm=50, echo=False)
    calls = [0]

    async def tick () -> None: calls[0] += 1

    measured = Bench.run(quiet.measure_async("tick", tick))

    assert measured.rounds == 10 and calls == [30] and measured.low <= measured.p50 <= measured.p95 <= measured.p99 <= measured.high

    assert Bench.run(Bench(rounds=5, warm=0, echo=False).measure_async("tick", tick)).rounds == 1 and calls == [31]
    assert Bench.run(Bench(rounds=40, warm=2, echo=False).measure_async("tick", tick)).rounds == 2 and calls == [35]
    assert Bench.run(quiet.measure_async("tick", tick, 7)).rounds == 7 and calls == [62]

    async def scripted () -> Sample:

        clocked(monkeypatch, [4000, 2000])

        try: return await quiet.measure_async("scripted", tick, 2)
        finally: monkeypatch.undo()

    assert Bench.run(scripted()) == Sample("scripted", 2, 4.0, 4.0, 4.0, 2.0, 4.0)
    assert capsys.readouterr().out == "" and len(quiet.samples()) == 3

    loud = Bench(rounds=10, warm=0)

    assert loud.measure("noop", lambda: None).rounds == 10 and capsys.readouterr().out.startswith("noop  p50=")

def test_bench_refuses_what_it_cannot_measure () -> None:

    for rounds, word in ((0, "int"), (-1, "int"), (10_000_001, "int"), (1.5, "float"), ("9", "9"), (True, "bool"), (None, "NoneType")):

        refused(partial(Bench, cast("Any", rounds)), "rounds", word)

    for warm, word in ((-1, "int"), (10_000_001, "int"), (2.0, "float"), (False, "bool"), (None, "NoneType")):

        refused(partial(Bench, 10, cast("Any", warm)), "warm", word)

    assert Bench(1, 0).measure("least", lambda: None, 1).rounds == 1 and Bench(10_000_000, 10_000_000).samples() == []

    bench = Bench(rounds=4, warm=0, echo=False)
    calls = [0]

    def work () -> None: calls[0] += 1

    async def tick () -> None: calls[0] += 1

    for name, word in (("", ""), ("n" * 129, "n" * 128), (5, "int"), (None, "NoneType"), (b"name", "bytes")):

        refused(partial(bench.measure, cast("Any", name), work), "name", word)

    for rounds, word in ((0, "int"), (-3, "int"), (10_000_001, "int"), (2.5, "float"), (True, "bool"), ("4", "4")):

        refused(partial(bench.measure, "work", work, cast("Any", rounds)), "rounds", word)

    for stray, word in ((None, "NoneType"), (5, "int"), ("work", "work"), (tick, "function"), (partial(tick), "partial")):

        refused(partial(bench.measure, "work", cast("Any", stray)), "work", word)

    assert calls == [0] and bench.samples() == [] and bench.measure("n" * 128, work).rounds == 4 and calls == [4]

    for spare in (None, 5, "work", work, tick):

        with pytest.raises(Fault) as caught: Bench.run(cast("Any", spare))

        assert caught.value.reason == "test.work" and caught.value.errors is None

    async def later () -> Sample:

        with pytest.raises(Fault) as named: await bench.measure_async("", tick)
        with pytest.raises(Fault) as counted: await bench.measure_async("tick", tick, 0)
        with pytest.raises(Fault) as worked: await bench.measure_async("tick", cast("Any", None))

        assert (named.value.reason, counted.value.reason, worked.value.reason) == ("test.name", "test.rounds", "test.work")

        return await bench.measure_async("tick", tick, 3)

    assert Bench.run(later()).rounds == 3 and calls == [7]

async def test_the_stage_provisions_and_closes_past_a_failing_part ( monkeypatch: pytest.MonkeyPatch ) -> None:

    fresh = Stage()

    monkeypatch.setenv("ENGINE_DATABASE_URL", "postgresql://a/b")
    monkeypatch.setenv("ENGINE_REDIS_URL", "redis://c/1")
    monkeypatch.setenv("ENGINE_AMQP_URL", "amqp://d/")

    assert (fresh.database_url(), fresh.redis_url(), fresh.amqp_url()) == ("postgresql://a/b", "redis://c/1", "amqp://d/")

    monkeypatch.undo()

    assert fresh.database_url() == stage.database_url() and fresh.redis_url() == stage.redis_url()

    fresh.wire()
    health.clear()

    await fresh.provision()
    await fresh.provision()

    healthy, facts = await health.ready()

    assert database.ready() and healthy and sorted(facts["checks"]) == ["cache", "database"] == sorted(health.describe()["probes"])

    async def torn () -> None: raise OSError("cache gone")

    monkeypatch.setattr(cache, "close", torn)

    with pytest.raises(OSError, match="cache gone"): await fresh.close()

    monkeypatch.undo()

    assert not database.ready() and health.describe()["probes"] == {}

    await fresh.close()

    cache.use(Memory())
