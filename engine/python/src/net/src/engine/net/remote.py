from collections.abc import AsyncGenerator, Mapping
from typing import Any, Self

from engine.error import Code, Fault
from engine.func import Breaker
from engine.string import string
from yarl import URL
from .arch import Reply, SCHEMES, SERVER, STATUSES
from .egress import Egress
from .net import Net
import contextlib

class Remote:

    name     = "remote"
    base     = ""
    timeout  = 10.0
    tries    = 2
    statuses : Mapping[int, str] = STATUSES

    def __init__ (
        self, net: Net, base: str | None = None, headers: Mapping[str, str] | None = None, egress: Egress | None = None,
        name: str | None = None,
    ) -> None:

        self.name     = name or self.name
        self._net     = net
        self._base    = (base or self.base).rstrip("/")
        self._headers = dict(headers or {})
        self._egress  = egress
        self._breaker = Breaker(self.name)

    def bearer ( self, token: str ) -> Self:

        self._headers["Authorization"] = f"Bearer {token}"

        return self

    def basic ( self, user: str, password: str ) -> Self:

        self._headers["Authorization"] = f"Basic {string.base64(f'{user}:{password}')}"

        return self

    def header ( self, name: str, value: str ) -> Self:

        self._headers[name] = value

        return self

    def url ( self, path: str ) -> str:

        if path.startswith(tuple(f"{scheme}://" for scheme in SCHEMES)): return path

        return f"{self._base}/{path.lstrip('/')}" if path else self._base

    def owns ( self, url: str ) -> bool:

        if not self._base: return True

        try: return URL(url).origin() == URL(self._base).origin()
        except (TypeError, ValueError): return False

    async def call ( self, method: str, path: str, **options: Any ) -> Reply:

        target  = self.url(path)
        headers = { **(self._headers if self.owns(target) else {}), **options.pop("headers", {}) }

        async def go () -> Reply:

            reply = await self._net.request(
                method, target, headers=headers, timeout=options.pop("timeout", self.timeout),
                tries=options.pop("tries", self.tries), egress=self._egress, **options,
            )

            if not reply.ok(): raise self.failure(reply)

            return reply

        return await self._breaker.call(go)

    async def stream ( self, method: str, path: str, **options: Any ) -> AsyncGenerator[bytes]:

        if not self._breaker.allows():

            raise Fault(Code.UNAVAILABLE, reason=f"breaker.{self.name}", retry_after=self._breaker.remaining())

        target  = self.url(path)
        headers = { **(self._headers if self.owns(target) else {}), **options.pop("headers", {}) }

        source = self._net.stream(
            method, target, headers=headers, timeout=options.pop("timeout", self.timeout), egress=self._egress,
            **options,
        )

        try:

            async with contextlib.aclosing(source) as pieces:

                async for piece in pieces: yield piece

        except Fault as fault:

            if fault.server() or fault.retryable(): self._breaker.fail()

            raise

        self._breaker.succeed()

    async def get ( self, path: str, **options: Any ) -> Any:

        return (await self.call("GET", path, **options)).json()

    async def post ( self, path: str, **options: Any ) -> Any:

        return (await self.call("POST", path, **options)).json()

    async def put ( self, path: str, **options: Any ) -> Any:

        return (await self.call("PUT", path, **options)).json()

    async def patch ( self, path: str, **options: Any ) -> Any:

        return (await self.call("PATCH", path, **options)).json()

    async def delete ( self, path: str, **options: Any ) -> Any:

        return (await self.call("DELETE", path, **options)).json()

    def failure ( self, reply: Reply ) -> Fault:

        mapped = self.statuses.get(reply.status)
        code   = Code.parse(mapped or "", None) if mapped else None

        if code is None: code = Code.UNAVAILABLE if reply.status >= SERVER else Code.BAD_REQUEST

        return Fault(code, reason=f"{self.name}.{mapped or reply.status}", unknown=reply.status >= SERVER)

    def breaker ( self ) -> Breaker:

        return self._breaker

    def net ( self ) -> Net:

        return self._net

    def describe ( self ) -> dict[str, object]:

        return { "name": self.name, "base": self._base, "breaker": self._breaker.describe() }
