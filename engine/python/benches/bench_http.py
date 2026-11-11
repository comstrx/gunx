from engine.error import Code, Fault
from engine.http import App, Binder, Envelope, Request, Response, Route, Router, Throttle
from engine.test import Bench, stage
from engine.validate import Shape
from typing import Any
import aiohttp, inspect

bench  = Bench()
router = Router()
binder = Binder()

class Note ( Shape ):

    body  : str
    count : int = 1

async def hello ( request: Request ) -> Any: return Response.ok({ "hello": "world" })

async def item ( request: Request, key: int, page: int = 1 ) -> Any: return { "key": key, "page": page }

async def notes ( note: Note ) -> Any: return Response.created({ "body": note.body })

router.register(Route.get("/users/<key>/posts/<slug>", hello, "posts"))

param = inspect.signature(item).parameters["key"]

def success () -> None: Envelope.success({ "hello": "world" })

def failure () -> None: Envelope.failure(Fault(Code.VALIDATION, reason="validate.shape", errors={ "email": ["is required"] }))

def answer () -> None: Response.ok({ "hello": "world" })

def refused () -> None: Response.fail(Fault(Code.TOO_MANY_REQUESTS, reason="http.throttled", retry_after=12.5))

def policy () -> None: Throttle.parse("100/1m:actor")

def url () -> None: router.url("posts", key=42, slug="hello-world", page=2)

def coerced () -> None: binder.coerce(int, "42", "key")

def bound () -> None: binder.bind(item, ("GET",))

async def main () -> None:

    stage.wire()

    app = App("Bench", origins=["http://localhost:3000"], docs=False)

    app.throttles(tight="1000000/1m")
    app.mount(
        Route.get("/hello", hello, "hello"), Route.get("/items/<key:int>", item, "item").throttled("tight"),
        Route.post("/notes", notes, "notes"),
    )

    async with app.listen() as url_, aiohttp.ClientSession() as session:

        async def plain () -> None:

            async with session.get(f"{url_}/hello") as reply: await reply.read()

        async def dressed () -> None:

            async with session.get(f"{url_}/hello", headers={ "Origin": "http://localhost:3000", "X-Request-Id": "req-1", "Accept-Language": "ar-EG,ar;q=0.9" }) as reply:

                await reply.read()

        async def routed () -> None:

            async with session.get(f"{url_}/items/7?page=3") as reply: await reply.read()

        async def posted () -> None:

            async with session.post(f"{url_}/notes", json={ "body": "hello", "count": 2 }) as reply: await reply.read()

        async def missing () -> None:

            async with session.get(f"{url_}/nope") as reply: await reply.read()

        await bench.measure_async("http.hello", plain, rounds=2000)
        await bench.measure_async("http.hello.dressed", dressed, rounds=2000)
        await bench.measure_async("http.item.throttled", routed, rounds=2000)
        await bench.measure_async("http.notes.shape", posted, rounds=2000)
        await bench.measure_async("http.missing", missing, rounds=1000)

bench.measure("http.envelope.success", success)
bench.measure("http.envelope.failure", failure)
bench.measure("http.response.ok", answer)
bench.measure("http.response.fail", refused)
bench.measure("http.throttle.parse", policy)
bench.measure("http.router.url", url)
bench.measure("http.binder.coerce", coerced)
bench.measure("http.binder.bind", bound, rounds=5000)

Bench.run(main())
