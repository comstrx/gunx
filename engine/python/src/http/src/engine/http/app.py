from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from contextlib import AsyncExitStack, asynccontextmanager
from pathlib import Path
from typing import Any, Self

from sanic import Blueprint, HTTPResponse, Sanic
from sanic.exceptions import SanicException
from engine.error import Code, Fault
from engine.exception import exception
from engine.health import health
from engine.log import log
from engine.thread import Gate
from .arch import Answer, Bound, INSTANCES, Lifecycle, Limits, Middleware, Mountable, Next, PHASES, Renderer
from .binder import Binder
from .channel import Channel
from .docs import Docs
from .edge import Edge
from .group import Group
from .request import Request
from .response import Response
from .route import Route
from .router import Router
import asyncio, socket

class App:

    def __init__ (
        self, name: str, version: str = "0.0.0", limits: Limits | None = None, origins: Sequence[str] = (),
        docs: bool = True, headers: Sequence[str] = (),
    ) -> None:

        self.name     = name
        self.version  = version
        self.limits   = limits or Limits()
        self.edge     = Edge(origins, headers)
        self._admission: tuple[asyncio.AbstractEventLoop, Gate] | None = None
        self.router   = Router()
        self.ready    = False
        self._binder  = Binder()
        self._stack: AsyncExitStack | None = None
        self._lifecycles: list[Lifecycle] = []
        self._layers: list[Middleware] = []
        self._renderers: dict[type[BaseException], Renderer] = {}
        self._routes: list[Route] = []
        self._channels: dict[str, Channel] = {}
        self._public: list[tuple[str, Path]] = []
        self._sealed  = False
        self._docs    = Docs(name, version) if docs else None
        self._sanic   = Sanic(self._unique_(name), request_class=Request, env_prefix=None, configure_logging=False)
        self._configure_()

    def sanic ( self ) -> Sanic[Any, Any]:

        return self._sanic

    def throttles ( self, **policies: str ) -> Self:

        for name, text in policies.items(): self.router.policy(name, text)

        return self

    def middleware ( self, *layers: Middleware ) -> Self:

        self._open_("middleware")
        self._layers.extend(layers)

        return self

    def routing ( self, *items: Mountable, live: str | None = "/health", ready: str | None = "/ready" ) -> Self:

        self.probes(live, ready)
        self.mount(*items)

        return self

    def render ( self, kind: type[BaseException], renderer: Renderer ) -> Self:

        self._renderers[kind] = renderer

        return self

    def lifecycle ( self, *factories: Lifecycle ) -> Self:

        self._lifecycles.extend(factories)

        return self

    def public ( self, folder: Path, prefix: str = "/" ) -> Self:

        self._open_("public")

        if not folder.is_dir(): raise Fault(Code.INTERNAL, reason="http.public", errors={ "folder": [folder.name] })

        self._public.append((f"{prefix.rstrip('/')}/", folder))

        return self

    def mount ( self, *items: Mountable ) -> int:

        self._open_("mount")

        added = 0

        for item in items:

            if isinstance(item, Channel):

                if item.name in self._channels or self.router.has(item.name):

                    raise Fault(Code.INTERNAL, reason="route.duplicate", errors={ "name": [item.name] })

                self._channels[item.name] = item

                added += 1

                continue

            for route in (item.walk() if isinstance(item, Group) else [item]):

                self.router.register(route)
                self._routes.append(route)

                added += 1

        return added

    def probes ( self, live: str | None = "/health", ready: str | None = "/ready" ) -> Self:

        async def alive () -> Answer:

            return Response.ok(health.live())

        async def readiness () -> Answer:

            healthy, report = await health.ready()

            if healthy and self.ready and self.edge.down is None: return Response.ok(report)

            failing = [name for name, fine in report["checks"].items() if not fine]

            if not self.ready: failing.append("draining")
            if self.edge.down is not None: failing.append("down")

            return Response.fail(Fault(Code.UNAVAILABLE, reason="health.degraded", errors={ "checks": failing }))

        if live: self.mount(Route.get(live, alive, "health").hide())
        if ready: self.mount(Route.get(ready, readiness, "ready").hide())

        self.edge.open = self.edge.open | { path for path in (live, ready) if path }

        return self

    def down ( self, retry: int = 60 ) -> None:

        self.edge.down = max(1, retry)

        log.warning("http.down", app=self.name, retry=self.edge.down)

    def up ( self ) -> None:

        self.edge.down = None

        log.info("http.up", app=self.name)

    def routes ( self ) -> tuple[Route, ...]:

        return tuple(self._routes)

    def channels ( self ) -> tuple[Channel, ...]:

        return tuple(self._channels.values())

    def openapi ( self, servers: Sequence[str] = () ) -> dict[str, Any]:

        if self._docs is None: raise Fault(Code.NOT_FOUND, reason="http.docs")

        return self._docs.build(self._routes, servers)

    def url ( self, route: str, **params: Any ) -> str:

        return self.router.url(route, **params)

    def seal ( self ) -> None:

        if self._sealed: return

        for route in self._routes: self._bind_(route)

        if self._channels or self._public or self._docs is not None:

            edged = Blueprint(self._unique_(f"{self.name}_edge"))
            edge  = self.edge

            async def enter ( request: Request ) -> HTTPResponse | None:

                return await edge.enter(request)

            async def leave ( request: Request, response: Answer ) -> None:

                await edge.leave(request, response)

            edged.on_request(enter)
            edged.on_response(leave)

            for channel in self._channels.values(): self._upgrade_(edged, channel)
            for prefix, folder in self._public: self._serve_(edged, prefix, folder)

            if self._docs is not None: edged.add_route(self._openapi_, "/openapi.json", name="openapi")

            self._sanic.blueprint(edged)

        self._sealed = True

    def serve ( self, host: str = "127.0.0.1", port: int = 8000, workers: int = 1, debug: bool = False ) -> None:

        self.seal()

        self._sanic.config.TOUCHUP    = True
        self._sanic.config.USE_UVLOOP = True

        if workers > 1: Sanic.start_method = "fork"

        self._sanic.run(
            host=host, port=port, workers=workers, debug=debug, access_log=False, motd=False,
            single_process=workers == 1,
        )

    @asynccontextmanager
    async def listen ( self, host: str = "127.0.0.1", port: int = 0 ) -> AsyncIterator[str]:

        self.seal()

        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((host, port))
        sock.listen(128)
        sock.settimeout(0.0)

        bound  = sock.getsockname()[1]
        server = await self._sanic.create_server(sock=sock, return_asyncio_server=True)

        if server is None: raise Fault(Code.INTERNAL, reason="http.listen")

        await server.startup()
        await server.before_start()
        await server.after_start()

        try: yield f"http://{host}:{bound}"
        finally:

            await server.before_stop()

            inner = getattr(server, "server", None)

            if inner is not None and hasattr(inner, "close_clients"): inner.close_clients()

            await server.close()
            await server.after_stop()

            sock.close()
            self._sanic.router.reset()
            self._sanic.signal_router.reset()

    async def start ( self ) -> None:

        stack = AsyncExitStack()

        try:

            for factory in self._lifecycles: await stack.enter_async_context(factory())

        except BaseException:

            await stack.aclose()

            raise

        self._stack = stack
        self.ready  = True

        health.fact(service=self.name, version=self.version)

        log.info("http.started", app=self.name, routes=len(self._routes), channels=len(self._channels))

    async def stop ( self ) -> None:

        self.ready = False

        await self.edge.later.drain(self.limits.shutdown_seconds)
        await self.edge.later.close()

        stack, self._stack = self._stack, None

        if stack is not None: await stack.aclose()

        log.info("http.stopped", app=self.name)

    def describe ( self ) -> dict[str, Any]:

        return {
            "name": self.name, "version": self.version, "routes": len(self._routes), "channels": len(self._channels),
            "middleware": len(self._layers), "renderers": sorted(kind.__name__ for kind in self._renderers),
            "ready": self.ready, "down": self.edge.down, "sealed": self._sealed, "phases": list(PHASES),
        }

    def _configure_ ( self ) -> None:

        settings = self._sanic.config

        settings.update(
            ACCESS_LOG=False, AUTO_EXTEND=False, TOUCHUP=False, FALLBACK_ERROR_FORMAT="json",
            REQUEST_MAX_SIZE=self.limits.body_bytes,
            REQUEST_MAX_HEADER_SIZE=self.limits.header_bytes,
            REQUEST_BUFFER_SIZE=max(16384, min(self.limits.body_bytes, 1048576)),
            REQUEST_TIMEOUT=self.limits.request_seconds,
            RESPONSE_TIMEOUT=self.limits.response_seconds, KEEP_ALIVE_TIMEOUT=self.limits.keepalive_seconds,
            GRACEFUL_SHUTDOWN_TIMEOUT=self.limits.shutdown_seconds, WEBSOCKET_MAX_SIZE=self.limits.socket_bytes,
            PROXIES_COUNT=None, REAL_IP_HEADER=None, FORWARDED_SECRET=None,
        )

        self._sanic.before_server_start(self._boot_)
        self._sanic.after_server_stop(self._halt_)
        self._sanic.exception(Exception)(self._fail_)

    async def _boot_ ( self, _: Sanic[Any, Any] ) -> None:

        await self.start()

    async def _halt_ ( self, _: Sanic[Any, Any] ) -> None:

        await self.stop()

    async def _fail_ ( self, request: Request, error: Exception ) -> Answer:

        if getattr(request.ctx, "token", None) is None:

            try: early = self.edge.trace(request)
            except Fault as refused: error, early = refused, None

            if early is not None:

                await self.edge.leave(request, early)

                return early

        fault  = exception.handle(self._translate_(error) if isinstance(error, SanicException) else error)
        answer = await self._render_(request, error, fault)

        await self.edge.leave(request, answer)

        return answer

    async def _render_ ( self, request: Request, error: Exception, fault: Fault ) -> Answer:

        for kind in type(error).__mro__:

            renderer = self._renderers.get(kind)

            if renderer is None: continue

            try: answer = await renderer(request, fault)
            except Exception as failed:

                exception.handle(failed)

                break

            if answer is not None: return answer

        return Response.fail(fault)

    def _gate_ ( self ) -> Gate:

        loop = asyncio.get_running_loop()

        if self._admission is None or self._admission[0] is not loop:

            self._admission = (loop, Gate(self.limits.concurrency))

        return self._admission[1]

    def _bind_ ( self, route: Route ) -> None:

        handler = self._binder.bind(route.handler, route.methods)
        guards  = route.guards
        layers  = (*self._layers, *route.layers)
        policy  = self.router.throttle(route.throttle) if route.throttle else None
        scope   = route.name or route.path
        piped   = self._chain_(layers, self._inner_(handler)) if layers else None

        async def served ( request: Request, **params: Any ) -> Answer:

            if policy is not None: await policy.check(request, scope)

            for guard in guards: await guard(request)

            if piped is not None: return await piped(request)

            return await handler(request, **params)

        wrapped = policy is not None or guards or piped is not None
        target  = served if wrapped else handler

        async def admitted ( request: Request, **params: Any ) -> Answer:

            gate = self._gate_()
            wait = self.limits.admission_seconds

            try: await gate.acquire(wait)
            except TimeoutError as error: raise Fault(Code.UNAVAILABLE, reason="http.busy", retry_after=wait) from error

            try: return await target(request, **params)
            finally: gate.release()

        chosen: Callable[..., Any] = admitted if self.limits.concurrency else target
        edge = self.edge

        async def edged ( request: Request, **params: Any ) -> Any:

            early  = edge.trace(request)
            answer = early if early is not None else await chosen(request, **params)
            late   = edge.stamp(request, answer)

            if late is not None: await late

            return answer

        edged.__name__ = self._identifier_(route.name or route.path) or "root"

        self._sanic.add_route(edged, route.path, methods=list(route.methods), name=route.name, strict_slashes=False)

    def _upgrade_ ( self, edged: Blueprint, channel: Channel ) -> None:

        upgraded = channel.upgrade()

        upgraded.__name__ = self._identifier_(channel.name)

        self.edge.guards[channel.name] = channel.guards

        edged.add_websocket_route(upgraded, channel.path, name=channel.name)

    def _serve_ ( self, edged: Blueprint, prefix: str, folder: Path ) -> None:

        for item in sorted(folder.iterdir()):

            if item.name.startswith(".") or not (item.is_file() or item.is_dir()): continue

            edged.static(f"{prefix}{item.name}", item, name=self._identifier_(f"public_{item.name}"))

    async def _openapi_ ( self, request: Request ) -> HTTPResponse:

        return Response.json(self.openapi([f"{request.scheme}://{request.host}"]))

    def _open_ ( self, verb: str ) -> None:

        if self._sealed: raise Fault(Code.INTERNAL, reason="http.sealed", errors={ "verb": [verb] })

    @staticmethod
    def _inner_ ( handler: Bound ) -> Callable[[Request], Awaitable[Answer]]:

        async def inner ( request: Request ) -> Answer:

            return await handler(request, **request.match_info)

        return inner

    @staticmethod
    def _translate_ ( error: SanicException ) -> Fault:

        code = Code.of(error.status_code)

        return Fault(code, reason=f"http.{code.value}", headers=dict(getattr(error, "headers", None) or {}))

    def _identifier_ ( self, name: str ) -> str:

        return "".join(ch if ch.isalnum() or ch == "_" else "_" for ch in name) or "engine"

    def _unique_ ( self, name: str ) -> str:

        return f"{self._identifier_(name)}_{next(INSTANCES)}"

    def _chain_ ( self, layers: Sequence[Middleware], last: Next ) -> Next:

        call = last

        for layer in reversed(layers): call = self._link_(layer, call)

        return call

    def _link_ ( self, layer: Middleware, call: Next ) -> Next:

        async def linked ( request: Request ) -> Answer:

            return await layer(request, call)

        return linked
