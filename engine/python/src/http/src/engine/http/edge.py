from collections.abc import Awaitable, Sequence

from sanic import HTTPResponse
from engine.context import context, Deferral, Opened
from engine.date import date
from engine.error import Code, Fault
from engine.exception import exception
from engine.log import log
from engine.rand import rand
from engine.thread import Tasks
from engine.token import token
from .arch import (
    AGE, Answer, ASKED, BACKLOG, BEARER, CACHE, CACHED, DEFERRED, EXPOSED, FIXED, Guard, HEADERS, IDENTITY, METHODS,
    ORIGIN, REFUSED, SECURITY, TRACE, UNIQUE,
)
from .outgoing import Outgoing
from .request import Request
from .response import Response

class Edge:

    def __init__ ( self, origins: Sequence[str] = (), headers: Sequence[str] = () ) -> None:

        self.origins = tuple(origins)
        self.allowed = ", ".join(dict.fromkeys((*HEADERS, *headers)))
        self.guards: dict[str, tuple[Guard, ...]] = {}
        self.open: frozenset[str] = frozenset()
        self.down: int | None = None
        self.later   = Tasks(DEFERRED)
        self.backlog = BACKLOG

    def trusted ( self, origin: str | None ) -> bool:

        return bool(origin) and (origin in self.origins or "*" in self.origins)

    def preflight ( self, request: Request ) -> HTTPResponse:

        if not self.trusted(request.headers.get(ORIGIN)): raise Fault(Code.FORBIDDEN, reason="http.origin")

        answer = Response.empty()

        answer.headers["Access-Control-Allow-Methods"] = METHODS
        answer.headers["Access-Control-Allow-Headers"] = self.allowed
        answer.headers["Access-Control-Max-Age"]       = AGE

        return answer

    def trace ( self, request: Request ) -> HTTPResponse | None:

        headers  = request.headers
        ctx      = request.ctx
        incoming = headers.get(TRACE) or ""
        valid    = 0 < len(incoming) <= IDENTITY and incoming.isascii() and incoming.replace("-", "").isalnum()
        identity = incoming if valid else rand.quick(8)

        ctx.request_id = identity
        ctx.actor      = None

        if log.debugging: ctx.started = date.monotonic()

        ctx.token = context.open(request_id=identity, locale=request.locale(), actor=None)

        for name in UNIQUE:

            if len(headers.getall(name, ())) > 1:

                raise Fault(Code.BAD_REQUEST, reason="http.header", errors={ str(name): ["is repeated"] })

        if self.down is not None and request.path not in self.open:

            raise Fault(Code.UNAVAILABLE, reason="http.down", retry_after=self.down)

        if request.method == "OPTIONS" and headers.get(ASKED): return self.preflight(request)

        carried = headers.get(BEARER) if token.ready() else None
        found   = token.bearer(carried) if carried else None

        if found:

            try: ctx.actor = token.verify(found, "access", request.fingerprint()).subject
            except Fault: ctx.actor = None

            if ctx.actor is not None: context.put(actor=ctx.actor)

        return None

    async def enter ( self, request: Request ) -> HTTPResponse | None:

        early = self.trace(request)

        if early is None: await self.guard(request)

        return early

    async def leave ( self, request: Request, response: Answer ) -> None:

        late = self.stamp(request, response)

        if late is not None: await late

    async def guard ( self, request: Request ) -> None:

        if not self.guards or not request.route: return

        for check in self.guards.get(request.route.name.rsplit(".", 1)[-1], ()): await check(request)

    def stamp ( self, request: Request, response: Answer ) -> Awaitable[None] | None:

        held = vars(request.ctx)

        if held.get("stamped"): return None

        held["stamped"] = True
        headers         = response.headers
        headers[TRACE]  = held.get("request_id", "")

        if isinstance(response, Outgoing): response.fixed = CACHED if CACHE in headers else FIXED
        elif CACHE in headers:

            for name, value in SECURITY.items(): headers.setdefault(name, value)

        else: headers.update(SECURITY)

        hit = held.get("throttle")

        if hit is not None:

            headers["X-RateLimit-Limit"]     = str(held["ceiling"])
            headers["X-RateLimit-Remaining"] = str(hit.remaining)

        origin = request.headers.get(ORIGIN)

        if origin and self.trusted(origin):

            headers["Access-Control-Allow-Origin"]   = origin
            headers["Access-Control-Expose-Headers"] = EXPOSED
            headers["Vary"] = "Origin"

        started = held.get("started")

        if started is not None:

            ms    = round((date.monotonic() - started) * 1000, 2)
            route = request.route.name.rsplit(".", 1)[-1] if request.route else None

            log.debug(
                "http.served", method=request.method, path=request.path, route=route, status=response.status, ms=ms,
            )

        opened = held.get("token")

        return self._release_(opened, response) if opened is not None else None

    def _release_ ( self, opened: Opened, response: Answer ) -> Awaitable[None] | None:

        pending = context.deferred()

        if pending is None or not pending.pending():

            context.close(opened)

            return None

        failed = response.status >= REFUSED

        if self.later.count() >= self.backlog: return self._drain_(pending, opened, failed)

        _ = self.later.spawn(pending.flush(exception.handle, failed), DEFERRED)
        context.close(opened)

        return None

    async def _drain_ ( self, pending: Deferral, opened: Opened, failed: bool ) -> None:

        try: await pending.flush(exception.handle, failed)
        finally: context.close(opened)
