from collections.abc import Callable, Sequence
from typing import Any, cast

from engine.error import Code, Fault
from engine.parse import parse
from engine.log import log
from engine.thread import Gate
from .arch import Command, INFLIGHT, PORT, real, TYPED
from .replies import Replies
import asyncio, hiredis, ssl

pack = cast("Callable[[tuple[Any, ...]], bytes]", hiredis.pack_command)

class Wire:

    def __init__ ( self, url: str, wait: float = 2.0, inflight: int = INFLIGHT ) -> None:

        if type(url) is not str: raise self._url_()

        try:

            parts = parse.url(url, schemes=("redis", "rediss"))
            db    = int(parts.path.lstrip("/") or "0")

        except (Fault, ValueError) as error: raise self._url_() from error

        if db < 0: raise self._url_()
        if type(inflight) is not int or inflight < 1: raise Fault(Code.INTERNAL, reason="cache.pool")

        self.host     = parts.host
        self.port     = parts.port or PORT
        self.db       = db
        self.user     = parts.user
        self.password = parts.password
        self.secure   = ssl.create_default_context() if parts.scheme == "rediss" else None
        self.wait     = real(wait, "wait")
        self._inflight = inflight
        self._gate    = Gate(inflight)
        self._lock: asyncio.Lock | None = None
        self._protocol: Replies | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    async def ready ( self ) -> Replies:

        loop = asyncio.get_running_loop()

        if self._loop is not loop:

            self._loop     = loop
            self._lock     = asyncio.Lock()
            self._gate     = Gate(self._inflight)
            self._protocol = None

        if self._protocol is not None and self._protocol.alive(): return self._protocol

        async with self._lock:  # type: ignore[union-attr]

            if self._protocol is not None and self._protocol.alive(): return self._protocol

            try:

                async with asyncio.timeout(self.wait):

                    _, protocol = await loop.create_connection(
                        lambda: Replies(self), self.host, self.port, ssl=self.secure,
                    )

                    if self.password:

                        auth = ("AUTH", self.user, self.password) if self.user else ("AUTH", self.password)

                        await protocol.submit(pack(auth))

                    if self.db: await protocol.submit(pack(("SELECT", self.db)))

            except (OSError, TimeoutError, hiredis.ReplyError) as error:

                log.warning("cache.redis", kind=type(error).__name__)

                raise self._failed_() from error

            self._protocol = protocol

            return protocol

    async def send ( self, *parts: str | bytes | float ) -> Any:

        protocol = self._protocol

        if protocol is None or not protocol.alive() or self._loop is not asyncio.get_running_loop():

            protocol = await self.ready()

        if not self._gate.take(): await self._admit_()

        try:

            if not protocol.writable.is_set():

                async with asyncio.timeout(self.wait): await protocol.writable.wait()

            return await protocol.submit(pack(parts))

        except hiredis.ReplyError as error: raise self._replied_(error) from error
        except (OSError, TimeoutError, ConnectionError) as error:

            if protocol.alive(): protocol.transport.abort()

            log.warning("cache.redis", kind=type(error).__name__)

            raise self._failed_() from error

        finally: self._gate.release()

    async def many ( self, commands: Sequence[Command] ) -> list[Any]:

        if not commands: return []

        protocol = self._protocol

        if protocol is None or not protocol.alive() or self._loop is not asyncio.get_running_loop():

            protocol = await self.ready()

        if not self._gate.take(): await self._admit_()

        try:

            futures = [protocol.submit(pack(tuple(command))) for command in commands]

            return list(await asyncio.gather(*futures))

        except hiredis.ReplyError as error: raise self._replied_(error) from error
        except (OSError, TimeoutError, ConnectionError) as error:

            if protocol.alive(): protocol.transport.abort()

            raise self._failed_() from error

        finally: self._gate.release()

    async def _admit_ ( self ) -> None:

        try: await self._gate.acquire(self.wait)
        except TimeoutError as error:

            log.warning("cache.redis", kind="Saturated")

            raise self._failed_() from error

    def dropped ( self, protocol: Replies ) -> None:

        if self._protocol is protocol: self._protocol = None

    async def close ( self ) -> None:

        protocol, self._protocol = self._protocol, None

        if protocol is not None and protocol.alive(): protocol.transport.close()

    def _replied_ ( self, error: hiredis.ReplyError ) -> Fault:

        said = str(error)

        if said.startswith("NOSCRIPT"): return Fault(Code.INTERNAL, reason="cache.script")
        if said.startswith(TYPED): return Fault(Code.INTERNAL, reason="cache.type")

        log.warning("cache.redis", kind="ReplyError", said=said[:80])

        return Fault(Code.INTERNAL, reason="cache.redis", unknown=True)

    def _failed_ ( self, kind: str = "cache.redis" ) -> Fault:

        return Fault(Code.UNAVAILABLE, reason=kind, unknown=True)

    @staticmethod
    def _url_ () -> Fault:

        return Fault(Code.INTERNAL, reason="cache.url")
