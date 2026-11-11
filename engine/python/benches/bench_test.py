from typing import Any

from engine.cache import Memory, cache
from engine.http import Request, Response, Route
from engine.net import net
from engine.test import Bench, Client, Reply, stage

bench  = Bench()
quiet  = Bench(rounds=1000, warm=0, echo=False)
remote = Client("http://127.0.0.1:1", { "Accept": "application/json" })
body   = { "code": "ok", "message": "Done", "reason": None, "errors": None, "data": { "id": 7, "name": "x" }, "meta": { "page": 1 } }
full   = Reply(200, body, { "x-request-id": "0123456789abcdef", "content-type": "application/json" })
bare   = Reply(204, None)
order  = { "id": 7, "lines": [{ "sku": "a-1", "count": 2, "price": 1250 }] * 4, "note": "leave at the door" }

def idle () -> None: return None

def measured () -> None:

    quiet.measure("idle", idle)
    quiet.clear()

def fields () -> None:

    full.data()
    full.code()
    full.reason()
    full.meta()

def blank () -> None:

    bare.data()
    bare.code()

def header () -> None: full.header("X-Request-Id")

def expected () -> None: remote.expect(full, 200, "ok")

def derived () -> None: remote.bearer("token").header("X-Mark", "1")

async def served () -> None:

    stage.wire()

    async def hello ( request: Request ) -> Any: return Response.ok({ "hi": "x" })

    async def taken ( request: Request ) -> Any: return Response.created(request.payload())

    app = stage.application(Route.get("/hello", hello, "hello"), Route.post("/orders", taken, "orders"))

    async with stage.client(app) as client:

        async def get () -> None: await client.get("/hello", page=1, tag=["a", "b"])

        async def post () -> None: await client.post("/orders", order)

        async def probe () -> None: client.expect(await client.get("/health"), 200, "ok")

        await bench.measure_async("test.client.get", get, rounds=3000)
        await bench.measure_async("test.client.post", post, rounds=3000)
        await bench.measure_async("test.client.health", probe, rounds=3000)

    await net.close()

    cache.use(Memory())

bench.measure("test.bench.measure1000", measured, rounds=300)
bench.measure("test.reply.fields", fields)
bench.measure("test.reply.blank", blank)
bench.measure("test.reply.header", header)
bench.measure("test.client.expect", expected)
bench.measure("test.client.derive", derived)
Bench.run(served())
