from collections.abc import Callable, Mapping
from typing import Any

from engine.error import Code, Fault
from .arch import CEILING, CORES, DRAIN, GRACE, ISOLATED, SCOPES, Submit, WORKERS, direct, environment, seconds, space
from .gate import Gate
from .cluster import Cluster
from .lane import Lane
from .pool import Pool
from .tasks import Tasks
import asyncio, inspect, math

class Scope:

    __slots__ = (
        "_capacity", "_env", "_lane", "_loop", "_pool", "_submit", "closed", "host", "mode", "namespace", "provider",
        "stopped", "tasks", "workers",
    )

    def __init__ ( self, mode: str ) -> None:

        if type(mode) is not str or mode not in SCOPES: raise Fault(Code.INTERNAL, reason="thread.mode")

        self.mode     = mode
        self.workers  = CORES if mode in ISOLATED else WORKERS
        self.provider = "ray" if mode == "remote" else None
        self.host     = "auto" if mode == "remote" else None
        self.namespace: str | None = None
        self._env: dict[str, Any] | None = None
        self.tasks    = Tasks("thread")
        self.stopped  = False
        self.closed   = False
        self._loop: asyncio.AbstractEventLoop | None = None
        self._pool: Pool | None = None
        self._lane: Lane | None = None
        self._capacity: Gate | None = None
        self._submit: Submit | None = None

    def options (
        self, workers: int | None, provider: str | None, host: str | None, *,
        namespace: str | None = None, runtime_env: Mapping[str, Any] | None = None,
    ) -> None:

        if self.closed: raise Fault(Code.CONFLICT, reason="thread.closed")
        if self._loop is not None: raise Fault(Code.CONFLICT, reason="thread.started")
        if workers is not None and (type(workers) is not int or not 1 <= workers <= CEILING):

            raise Fault(Code.INTERNAL, reason="thread.workers")

        name, env = self._remote_(provider, host, namespace, runtime_env)

        if workers is not None: self.workers = workers
        if provider is not None: self.provider = provider
        if host is not None: self.host = host
        if namespace is not None: self.namespace = name
        if runtime_env is not None: self._env = env

    def accept ( self ) -> None:

        self.bind()

        if self.stopped: raise Fault(Code.CONFLICT, reason="thread.stopped")

    def bind ( self ) -> None:

        if self.closed: raise Fault(Code.CONFLICT, reason="thread.closed")

        try: loop = asyncio.get_running_loop()
        except RuntimeError as error: raise Fault(Code.INTERNAL, reason="thread.loop") from error

        if self._loop is not None and self._loop is not loop:

            raise Fault(Code.CONFLICT, reason="thread.loop")

        self._loop = loop

    async def start ( self ) -> None:

        self.bind()
        self.stopped = False

        try: await self._opened_()
        except BaseException:

            self.stopped = True

            raise

    async def call ( self, handler: Callable[..., Any], item: Any ) -> Any:

        try:

            submit = self._submit

            if self.closed or submit is None: submit = await self._opened_()

            capacity = self._capacity

            if capacity is None: return await submit(handler, item)

            if not capacity.take(): await capacity.acquire(math.inf)

            try:

                if self.mode != "async": return await submit(handler, item)

                made = handler(item)

                return await made if inspect.isawaitable(made) else made

            finally: capacity.release()

        except (Exception, SystemExit, KeyboardInterrupt) as error:

            raise Fault.wrap(error, reason="thread.failed") from error

    async def join ( self, grace: float = DRAIN ) -> None:

        wait = seconds(grace)
        self.bind()
        loop = asyncio.get_running_loop()
        until = loop.time() + wait

        await self.tasks.drain(wait)

        if self.tasks.count(): raise Fault(Code.TIMEOUT, reason="thread.join", unknown=True)
        if self._pool is not None: await self._pool.join(max(0.0, until - loop.time()))
        if self._lane is not None: await self._lane.join(max(0.0, until - loop.time()))

    async def drop ( self, grace: float = GRACE ) -> int:

        wait = seconds(grace)

        if self.closed: return 0

        self.bind()
        self.stopped = self.closed = True

        try: return await self.tasks.close(wait)
        finally:

            if self._pool is not None: self._pool.close(kill=True)
            if self._lane is not None: self._lane.close(kill=True)

    def unsupported ( self, verb: str ) -> None:

        raise Fault(
            Code.NOT_IMPLEMENTED, reason="thread.unsupported", message=f"{verb} is unavailable in {self.mode} mode",
            errors={ "mode": [self.mode], "verb": [verb] },
        )

    def describe ( self ) -> dict[str, object]:

        return {
            "mode": self.mode, "provider": self.provider, "host": self.host, "workers": self.workers,
            "tasks": self.tasks.count(), "stopping": self.stopped, "closed": self.closed,
            "namespace": self.namespace, "runtime_env": self._env is not None,
        }

    def _remote_ (
        self, provider: str | None, host: str | None, namespace: str | None,
        runtime_env: Mapping[str, Any] | None,
    ) -> tuple[str | None, dict[str, Any] | None]:

        if self.mode != "remote":

            for key, value in (
                ("provider", provider), ("host", host), ("namespace", namespace), ("runtime_env", runtime_env),
            ):

                if value is not None: self.unsupported(key)

        elif provider is not None and provider != "ray": self.unsupported("provider")

        if host is not None and (type(host) is not str or not host.strip()):

            raise Fault(Code.INTERNAL, reason="thread.host")

        return space(namespace), environment(runtime_env)

    async def _opened_ ( self ) -> Submit:

        if self.closed: raise Fault(Code.CONFLICT, reason="thread.closed")
        if self._submit is not None: return self._submit

        if self.mode == "remote":

            cluster = await Cluster.connect(self.host, namespace=self.namespace, runtime_env=self._env)

            if self.closed: raise Fault(Code.CONFLICT, reason="thread.closed")
            if self._submit is None:

                self._capacity = Gate(self.workers)
                self._submit = cluster.call

        elif self.mode == "async":

            self._capacity = Gate(self.workers)
            self._submit = direct

        elif self.mode == "thread":

            self._pool = Pool(self.mode, self.workers)
            self._submit = self._pool.submit

        else:

            self._lane = Lane(self.mode, self.workers)
            self._submit = self._lane.submit

        return self._submit

