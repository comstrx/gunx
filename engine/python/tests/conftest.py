from aiohttp import web
from engine.json import json
from engine.net import Egress, Remote, net
from collections.abc import AsyncIterator
from typing import Any, Self
import pytest

LOCAL = Egress(allow_private=True, ports=frozenset())

class Provider:

    def __init__ ( self ) -> None:

        self.port = 0
        self.seen: list[tuple[str, str, Any]] = []
        self.answers: list[Any] = []
        self._runner: web.AppRunner | None = None

    async def __aenter__ ( self ) -> Self:

        app = web.Application(client_max_size=64 * 1024 * 1024)

        app.router.add_route("*", "/{tail:.*}", self.handle)

        self._runner = web.AppRunner(app)

        await self._runner.setup()
        await web.TCPSite(self._runner, "127.0.0.1", 0).start()

        self.port = int(self._runner.addresses[0][1])

        return self

    async def __aexit__ ( self, *_: object ) -> None:

        await net.close()

        if self._runner is not None: await self._runner.cleanup()

    def remote ( self ) -> Remote:

        return Remote(net, f"http://127.0.0.1:{self.port}", { "X-Key": "k" }, LOCAL)

    def answer ( self, *answers: Any ) -> Self:

        self.answers.extend(answers)

        return self

    def last ( self ) -> Any:

        return self.seen[-1][2]

    async def handle ( self, request: web.Request ) -> web.StreamResponse:

        raw = await request.read()

        self.seen.append((request.method, request.raw_path, json.loads(raw) if raw else None))

        answer = self.answers.pop(0) if self.answers else { "id": "p-1", "status": "sent" }

        if isinstance(answer, int): return web.Response(status=answer, body=b'{"error":"hidden"}', content_type="application/json")
        if isinstance(answer, bytes): return web.Response(status=200, body=answer, content_type="application/json")

        return web.json_response(answer)

@pytest.fixture
async def provider () -> AsyncIterator[Provider]:

    async with Provider() as made: yield made
