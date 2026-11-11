from collections.abc import AsyncGenerator, AsyncIterator, Mapping
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlencode

from yarl import URL
from engine.error import Code, Fault
from engine.fs import file
from engine.func import func
from engine.json import json
from engine.log import log
from .arch import BODILY, CARRIED, EVENT, IDEMPOTENT, LINE, MAX_BODY, MOVED, OK_HIGH, OK_LOW, PRIVATE, REDIRECTS, Reply
from .arch import LONGEST, REWRITTEN, SEE_OTHER, SERVER, THROTTLED, TIMEOUT, VERB
from .egress import Egress
from .resolver import Resolver
import aiohttp, asyncio, contextlib

class Net:

    def __init__ ( self ) -> None:

        self._sessions: dict[bool, aiohttp.ClientSession] = {}
        self._egress  = Egress()
        self._limit   = MAX_BODY
        self._timeout = TIMEOUT
        self._sent    = 0

    def setup ( self, egress: Egress | None = None, limit: int = MAX_BODY, timeout: float = TIMEOUT ) -> None:

        held: object = egress

        if held is not None and not isinstance(held, Egress): raise self._unset_("egress")

        self._limit   = self._whole_(limit, "limit")
        self._timeout = self._timed_(timeout, "timeout")

        if egress is not None: self._egress = egress

    def egress ( self ) -> Egress:

        return self._egress

    async def session ( self, egress: Egress | None = None ) -> aiohttp.ClientSession:

        loose = (egress or self._egress).allow_private
        found = self._sessions.get(loose)

        if found is None or found.closed:

            guard     = None if loose else Resolver()
            factory   = guard.make if guard else None
            connector = aiohttp.TCPConnector(
                limit=64, limit_per_host=16, ttl_dns_cache=60, resolver=guard, socket_factory=factory,
            )
            found     = aiohttp.ClientSession(connector=connector, auto_decompress=True, raise_for_status=False)

            self._sessions[loose] = found

        return found

    def segment ( self, value: str ) -> str:

        if value in ("", ".", ".."): raise Fault(Code.VALIDATION, reason="net.segment", errors={ "segment": [value] })

        return quote(value, safe="")

    async def request (
        self, method: str, url: str, *, headers: Mapping[str, str] | None = None, body: Any = None,
        data: Mapping[str, Any] | None = None, query: Mapping[str, Any] | None = None, timeout: float | None = None,
        limit: int | None = None, tries: int = 1, egress: Egress | None = None, redirects: int = REDIRECTS,
    ) -> Reply:

        guard  = egress or self._egress
        target = self._target_(url, guard)
        verb   = self._verb_(method)

        sent: dict[str, str] = dict(headers or {})
        payload = body

        if data is not None:

            payload = json.encode(data)
            sent.setdefault("Content-Type", "application/json")

        sent.setdefault("Accept", "application/json")

        budget = (
            self._timeout if timeout is None else self._timed_(timeout, "timeout"),
            self._limit if limit is None else self._whole_(limit, "limit"), self._whole_(redirects, "redirects", 0),
        )

        async def once () -> Reply:

            return await self._send_(verb, target, sent, payload, query, budget, guard)

        tries = self._whole_(tries, "tries") if self._fixed_(payload) else 1
        reply = await func.retry(once, tries=tries, idempotent=verb in IDEMPOTENT)

        self._sent += 1

        return reply

    async def get ( self, url: str, **options: Any ) -> Reply:

        return await self.request("GET", url, **options)

    async def post ( self, url: str, **options: Any ) -> Reply:

        return await self.request("POST", url, **options)

    async def put ( self, url: str, **options: Any ) -> Reply:

        return await self.request("PUT", url, **options)

    async def delete ( self, url: str, **options: Any ) -> Reply:

        return await self.request("DELETE", url, **options)

    async def head ( self, url: str, **options: Any ) -> Reply:

        return await self.request("HEAD", url, **options)

    async def patch ( self, url: str, **options: Any ) -> Reply:

        return await self.request("PATCH", url, **options)

    async def json ( self, url: str, method: str = "GET", **options: Any ) -> Any:

        reply = await self.request(method, url, **options)

        if not reply.ok(): raise self.fault(reply)

        return reply.json()

    async def form ( self, url: str, fields: Mapping[str, Any], **options: Any ) -> Reply:

        headers = { **options.pop("headers", {}), "Content-Type": "application/x-www-form-urlencoded" }
        encoded = urlencode([(key, self._scalar_(value)) for key, value in fields.items()])

        return await self.request("POST", url, body=encoded, headers=headers, **options)

    async def upload (
        self, url: str, files: Mapping[str, tuple[str, bytes, str]], fields: Mapping[str, Any] | None = None,
        **options: Any,
    ) -> Reply:

        form = aiohttp.FormData()

        for key, value in (fields or {}).items(): form.add_field(key, self._scalar_(value))
        for key, (name, data, media) in files.items(): form.add_field(key, data, filename=name, content_type=media)

        return await self.request("POST", url, body=form, **options)

    async def save ( self, url: str, path: Path, limit: int | None = None, **options: Any ) -> int:

        try: return await file.pour(path, self.stream("GET", url, **options), limit or self._limit)
        except Fault as fault:

            if fault.reason != "fs.size": raise

            raise Fault(Code.TOO_LARGE, reason="net.body") from fault

    async def paginate (
        self, url: str, items: str = "data", cursor: str = "next", pages: int = 100, **options: Any,
    ) -> AsyncIterator[Any]:

        current: str | None = url
        seen = 0

        while current and seen < pages:

            body = await self.json(current, **options)
            page = body.get(items) if isinstance(body, Mapping) else body

            for item in page or []: yield item

            seen   += 1
            after   = body.get(cursor) if isinstance(body, Mapping) else None
            current = self._next_(current, str(after)) if after else None

    async def graphql ( self, url: str, query: str, variables: Mapping[str, Any] | None = None, **options: Any ) -> Any:

        body = await self.json(url, "POST", data={ "query": query, "variables": dict(variables or {}) }, **options)

        if isinstance(body, Mapping) and body.get("errors"):

            raise Fault(Code.BAD_REQUEST, reason="net.graphql", errors={ "graphql": [str(body["errors"])[:200]] })

        return body.get("data") if isinstance(body, Mapping) else body

    async def reachable ( self, host: str, port: int, timeout: float = 1.0, egress: Egress | None = None ) -> bool:

        guard = egress or self._egress

        guard.allow(host, port)

        try:

            async with asyncio.timeout(timeout):

                for address in await guard.resolve(host):

                    if await self._knock_(address, port): return True

        except TimeoutError: return False
        except Fault as fault:

            if fault.reason != "net.resolve": raise

        return False

    async def stream (
        self, method: str, url: str, *, headers: Mapping[str, str] | None = None, body: bytes | str | None = None,
        data: Mapping[str, Any] | None = None, query: Mapping[str, Any] | None = None, timeout: float | None = None,
        egress: Egress | None = None, chunk: int = 65536,
    ) -> AsyncGenerator[bytes]:

        guard  = egress or self._egress
        target = self._target_(url, guard)
        verb   = self._verb_(method)
        pieces = self._whole_(chunk, "chunk")

        sent: dict[str, str] = dict(headers or {})
        payload = body

        if data is not None:

            payload = json.encode(data)
            sent.setdefault("Content-Type", "application/json")

        session = await self.session(guard)
        seconds = self._timeout if timeout is None else self._timed_(timeout, "timeout")
        waits   = aiohttp.ClientTimeout(total=None, sock_connect=seconds, sock_read=seconds)

        try:

            async with session.request(
                verb, target, headers=sent, data=payload, params=self._query_(query), allow_redirects=False,
                timeout=waits,
            ) as response:

                if not OK_LOW <= response.status < OK_HIGH:

                    head = await self._body_(response, self._limit)
                    seen = dict(response.headers.items())

                    raise self.fault(Reply(response.status, seen, head, str(response.url), 0.0))

                self._sent += 1

                async for piece in response.content.iter_chunked(pieces): yield piece

        except TimeoutError as error: raise Fault(Code.TIMEOUT, reason="net.timeout", unknown=True) from error
        except aiohttp.ClientError as error: raise self._failed_(target, error) from error

    async def lines ( self, source: AsyncIterator[bytes], limit: int = LINE ) -> AsyncGenerator[bytes]:

        held = bytearray()
        scan = 0

        try:

            async for piece in source:

                held.extend(piece)

                start = 0

                while (at := held.find(b"\n", scan)) >= 0:

                    if at - start > limit: raise self._long_("net.line")

                    yield bytes(held[start:at])

                    start = scan = at + 1

                if start: del held[:start]

                scan = len(held)

                if scan > limit: raise self._long_("net.line")

            if held: yield bytes(held)

        finally: await self._shut_(source)

    async def sse (
        self, source: AsyncIterator[bytes], limit: int = LINE, most: int = EVENT,
    ) -> AsyncGenerator[tuple[str, str]]:

        event, size = "message", 0
        lines: list[str] = []

        async with contextlib.aclosing(self.lines(source, limit)) as rows:

            async for raw in rows:

                line = raw.decode("utf-8", "replace").rstrip("\r")

                if line == "":

                    if lines: yield event, "\n".join(lines)

                    event, size, lines = "message", 0, []

                    continue

                if line.startswith(":"): continue

                field, _, value = line.partition(":")
                value = value.removeprefix(" ")

                if field == "event": event = value
                elif field == "data":

                    size += len(value) + 1

                    if size > most: raise self._long_("net.event")

                    lines.append(value)

        if lines: yield event, "\n".join(lines)

    async def download ( self, url: str, limit: int, **options: Any ) -> bytes:

        reply = await self.request("GET", url, limit=limit, **options)

        if not reply.ok(): raise Fault(Code.of(reply.status), reason="net.status")

        return reply.body

    def fault ( self, reply: Reply, reason: str = "net.status" ) -> Fault:

        code = Code.of(reply.status)

        if reply.status == THROTTLED: code = Code.TOO_MANY_REQUESTS
        elif reply.status >= SERVER: code = Code.UNAVAILABLE

        return Fault(code, reason=reason, unknown=reply.status >= SERVER)

    async def close ( self ) -> None:

        sessions, self._sessions = self._sessions, {}

        for session in sessions.values():

            if not session.closed: await session.close()

    def stats ( self ) -> dict[str, int]:

        return { "sent": self._sent }

    async def _send_ (
        self, method: str, target: URL, headers: dict[str, str], payload: Any,
        query: Mapping[str, Any] | None, budget: tuple[float, int, int], guard: Egress,
    ) -> Reply:

        session = await self.session(guard)
        loop    = asyncio.get_running_loop()
        started = loop.time()
        params  = self._query_(query)

        try:

            async with asyncio.timeout(budget[0]):

                for _ in range(budget[2] + 1):

                    async with session.request(
                        method, target, headers=headers, data=payload, params=params, allow_redirects=False,
                        max_line_size=16384, max_field_size=16384,
                    ) as response:

                        if response.status not in MOVED or not response.headers.get("Location") or not budget[2]:

                            body = await self._body_(response, budget[1])
                            ms   = round((loop.time() - started) * 1000, 3)

                            return Reply(response.status, dict(response.headers.items()), body, str(response.url), ms)

                        method, target, headers, payload = self._hop_(response, method, headers, payload, guard)
                        params = None

        except TimeoutError as error: raise Fault(Code.TIMEOUT, reason="net.timeout", unknown=True) from error
        except aiohttp.ClientError as error: raise self._failed_(target, error) from error

        raise Fault(Code.UNAVAILABLE, reason="net.redirects")

    def _hop_ (
        self, response: aiohttp.ClientResponse, method: str, headers: dict[str, str], payload: Any, guard: Egress,
    ) -> tuple[str, URL, dict[str, str], Any]:

        try: target = self._target_(str(response.url.join(URL(response.headers["Location"]))), guard)
        except (TypeError, ValueError) as error: raise Fault(Code.UNAVAILABLE, reason="net.redirect") from error
        except Fault as fault:

            if fault.code is Code.FORBIDDEN: raise

            raise Fault(Code.UNAVAILABLE, reason="net.redirect") from fault

        if target.origin() != response.url.origin():

            headers = { key: value for key, value in headers.items() if key.lower() in CARRIED }

        if response.status == SEE_OTHER or (response.status in REWRITTEN and method == "POST"):

            kept = { key: value for key, value in headers.items() if key.lower() not in BODILY }

            return method if method == "HEAD" else "GET", target, kept, None

        if not self._fixed_(payload): raise Fault(Code.UNAVAILABLE, reason="net.redirect")

        return method, target, headers, payload

    def _target_ ( self, url: str, guard: Egress ) -> URL:

        parts = guard.check(url)

        try: target = URL(url.strip())
        except (TypeError, ValueError) as error: raise Fault(Code.BAD_REQUEST, reason="net.url") from error

        hosts = (target.host, target.raw_host)

        if target.scheme != parts.scheme or parts.host not in hosts or parts.port not in (None, target.port):

            raise Fault(Code.BAD_REQUEST, reason="net.url")

        return target

    def _failed_ ( self, target: URL, error: aiohttp.ClientError ) -> Fault:

        log.debug("net.failed", host=target.host, kind=type(error).__name__)

        if isinstance(error, aiohttp.ClientConnectorError) and error.os_error.strerror == PRIVATE:

            return Fault(Code.FORBIDDEN, reason=PRIVATE, errors={ "host": [target.host or ""] })

        if isinstance(error, aiohttp.InvalidURL): return Fault(Code.BAD_REQUEST, reason="net.url")

        return Fault(Code.UNAVAILABLE, reason="net.connect", unknown=True)

    def _long_ ( self, reason: str ) -> Fault:

        return Fault(Code.TOO_LARGE, reason=reason, unknown=True)

    def _verb_ ( self, method: object ) -> str:

        if type(method) is not str or not method.isalpha() or not 0 < len(method) <= VERB: raise self._unset_("method")

        return method.upper()

    def _whole_ ( self, value: object, what: str, least: int = 1 ) -> int:

        if type(value) is not int or value < least: raise self._unset_(what)

        return value

    def _timed_ ( self, value: object, what: str ) -> float:

        if not isinstance(value, int | float) or type(value) is bool: raise self._unset_(what)
        if not 0 < value <= LONGEST: raise self._unset_(what)

        return float(value)

    @staticmethod
    def _unset_ ( what: str ) -> Fault:

        return Fault(Code.INTERNAL, reason="net.settings", errors={ "setting": [what] })

    @staticmethod
    async def _shut_ ( source: AsyncIterator[bytes] ) -> None:

        shut = getattr(source, "aclose", None)

        if shut is not None: await shut()

    def _next_ ( self, current: str, after: str ) -> str:

        try: base, target = URL(current), URL(current).join(URL(after))
        except (TypeError, ValueError) as error: raise Fault(Code.UNAVAILABLE, reason="net.page") from error

        if target.origin() != base.origin(): raise Fault(Code.UNAVAILABLE, reason="net.page")

        return str(target)

    async def _knock_ ( self, address: str, port: int ) -> bool:

        try: _, writer = await asyncio.open_connection(address, port)
        except OSError: return False

        writer.close()

        with contextlib.suppress(OSError): await writer.wait_closed()

        return True

    @staticmethod
    def _fixed_ ( payload: Any ) -> bool:

        return payload is None or isinstance(payload, bytes | bytearray | str)

    async def _body_ ( self, response: aiohttp.ClientResponse, limit: int ) -> bytes:

        if int(response.headers.get("Content-Length") or 0) > limit: raise Fault(Code.TOO_LARGE, reason="net.body")

        body = bytearray()

        async for chunk in response.content.iter_chunked(65536):

            body.extend(chunk)

            if len(body) > limit: raise Fault(Code.TOO_LARGE, reason="net.body")

        return bytes(body)

    def _query_ ( self, query: Mapping[str, Any] | None ) -> list[tuple[str, str]] | None:

        if not query: return None

        pairs: list[tuple[str, str]] = []

        for key, value in query.items():

            items = value if isinstance(value, list | tuple) else (value,)

            pairs.extend((key, self._scalar_(item)) for item in items if item is not None)

        return pairs

    @staticmethod
    def _scalar_ ( value: Any ) -> str:

        if value is True: return "true"
        if value is False: return "false"

        return str(value)
