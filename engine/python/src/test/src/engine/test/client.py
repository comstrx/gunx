from collections.abc import Mapping
from typing import Any

from engine.error import Code, Fault
from engine.json import json
from engine.net import net
from .arch import BASES, LOCAL, SHOWN, WORD
from .reply import Reply

class Client:

    def __init__ ( self, base: str, headers: Mapping[str, str] | None = None ) -> None:

        if type(base) is not str or not base.startswith(BASES): raise self._refused_("base", base)

        self._base    = base.rstrip("/")
        self._headers = dict(headers or {})

    def bearer ( self, token_: str ) -> Client:

        return Client(self._base, { **self._headers, "Authorization": f"Bearer {token_}" })

    def header ( self, name: str, value: str ) -> Client:

        return Client(self._base, { **self._headers, name: value })

    async def call (
        self, method: str, path: str, data: Any = None,
        query: Mapping[str, Any] | None = None, raw: bytes | None = None,
    ) -> Reply:

        if type(path) is not str or not path.startswith("/"): raise self._refused_("path", path)
        if data is not None and raw is not None: raise self._refused_("body", raw)

        headers = dict(self._headers)
        body    = raw

        if data is not None:

            body = json.encode(data)
            headers.setdefault("Content-Type", "application/json")

        reply = await net.request(
            method, f"{self._base}{path}", headers=headers, body=body, query=query, egress=LOCAL, redirects=0,
        )

        carried = { key.lower(): value for key, value in reply.headers.items() }

        return Reply(reply.status, self._payload_(reply.body), carried)

    async def get ( self, path: str, **query: Any ) -> Reply:

        return await self.call("GET", path, query=query)

    async def head ( self, path: str, **query: Any ) -> Reply:

        return await self.call("HEAD", path, query=query)

    async def post ( self, path: str, data: Any = None ) -> Reply:

        return await self.call("POST", path, data)

    async def put ( self, path: str, data: Any = None ) -> Reply:

        return await self.call("PUT", path, data)

    async def patch ( self, path: str, data: Any = None ) -> Reply:

        return await self.call("PATCH", path, data)

    async def delete ( self, path: str ) -> Reply:

        return await self.call("DELETE", path)

    async def options ( self, path: str ) -> Reply:

        return await self.call("OPTIONS", path)

    def expect ( self, reply: Reply, status: int, code: str | None = None, reason: str | None = None ) -> Reply:

        if reply.status != status:

            shown = str(reply.body)[:SHOWN]

            raise Fault(Code.INTERNAL, f"expected {status}, got {reply.status}: {shown}", "test.status")

        if code is not None and reply.code() != code:

            raise Fault(Code.INTERNAL, f"expected code {code}, got {str(reply.code())[:WORD]}", "test.code")

        if reason is not None and reply.reason() != reason:

            raise Fault(Code.INTERNAL, f"expected reason {reason}, got {str(reply.reason())[:WORD]}", "test.reason")

        return reply

    def _payload_ ( self, body: bytes ) -> Any:

        if not body: return None

        try: return json.decode(body)
        except Fault: return body.decode("utf-8", "replace")

    def _refused_ ( self, reason: str, asked: object ) -> Fault:

        word = asked[:WORD] if type(asked) is str else type(asked).__name__

        return Fault(Code.INTERNAL, reason=f"test.{reason}", errors={ reason: [word] })
