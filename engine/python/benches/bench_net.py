from aiohttp import web
from engine.log import log
from engine.net import Egress, Remote, net
from engine.test import Bench
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any
import asyncio

LOCAL  = Egress(allow_private=True, ports=frozenset())
STRICT = Egress()
bench  = Bench()
loop   = asyncio.new_event_loop()
lines  = b"".join(b"%d: the quick brown fox jumps over the lazy dog\n" % at for at in range(1000))
events = b"".join(b'event: tick\ndata: {"n": %d, "text": "quick brown fox"}\n\n' % at for at in range(200))

class Upstream:

    def __init__ ( self ) -> None:

        self.port = 0
        self._runner: web.AppRunner | None = None

    async def start ( self ) -> None:

        app = web.Application()

        app.router.add_get("/ok", self.ok)
        app.router.add_get("/lines", self.lines)
        app.router.add_post("/echo", self.echo)

        self._runner = web.AppRunner(app)

        await self._runner.setup()
        await web.TCPSite(self._runner, "127.0.0.1", 0).start()

        self.port = int(self._runner.addresses[0][1])

    async def stop ( self ) -> None:

        if self._runner is not None: await self._runner.cleanup()

    async def ok ( self, _: web.Request ) -> web.Response:

        return web.json_response({ "ok": True, "items": [1, 2, 3] })

    async def lines ( self, _: web.Request ) -> web.Response:

        return web.Response(body=lines, content_type="application/x-ndjson")

    async def echo ( self, request: web.Request ) -> web.Response:

        return web.json_response({ "size": len(await request.read()) })

def run ( work: Any ) -> Any:

    return loop.run_until_complete(work)

async def pieces ( raw: bytes, size: int ) -> AsyncIterator[bytes]:

    for at in range(0, len(raw), size): yield raw[at:at + size]

def segment () -> None: net.segment("orders/2026 عربي")

def checked () -> None: STRICT.check("https://api.example.com:8443/v1/orders?page=2")

def private () -> None: STRICT.private("8.8.8.8")

def inside () -> None: STRICT.private("::ffff:10.0.0.1")

async def splitting () -> None:

    async for _ in net.lines(pieces(lines, 4096)): pass

async def framing () -> None:

    async for _ in net.sse(pieces(events, 4096)): pass

upstream = Upstream()

log.setup("error", "json", Path("/dev/null"))
run(upstream.start())

base   = f"http://127.0.0.1:{upstream.port}"
remote = Remote(net, base, { "X-Key": "k" }, LOCAL)

def joined () -> None: remote.url("/v1/orders/7")

def owned () -> None: remote.owns(f"{base}/x")

async def getting () -> None: await net.get(f"{base}/ok", egress=LOCAL)

async def posting () -> None: await net.post(f"{base}/echo", data={ "k": "v", "n": 7 }, egress=LOCAL)

async def remoting () -> None: await remote.get("/ok")

async def streaming () -> None:

    async for _ in net.lines(net.stream("GET", f"{base}/lines", egress=LOCAL)): pass

bench.measure("net.segment", segment)
bench.measure("net.egress.check", checked)
bench.measure("net.egress.private.public", private)
bench.measure("net.egress.private.mapped", inside)
bench.measure("net.remote.url", joined)
bench.measure("net.remote.owns", owned)
run(bench.measure_async("net.lines.1000", splitting, rounds=500))
run(bench.measure_async("net.sse.200", framing, rounds=500))
run(bench.measure_async("net.get.loopback", getting, rounds=1000))
run(bench.measure_async("net.post.json", posting, rounds=1000))
run(bench.measure_async("net.remote.get", remoting, rounds=1000))
run(bench.measure_async("net.stream.lines.1000", streaming, rounds=300))

run(net.close())
run(upstream.stop())
loop.close()
log.close()
