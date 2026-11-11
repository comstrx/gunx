from contextlib import suppress
from typing import Any, Self

from engine.error import Code, Fault
import asyncio

class Pipe:

    def __init__ ( self, capacity: int = 64 ) -> None:

        self._queue: asyncio.Queue[bytes | None] = asyncio.Queue(max(1, capacity))
        self._closed  = False
        self._written = 0
        self._dropped = 0

    async def write ( self, data: bytes, wait: float | None = None ) -> None:

        if self._closed: raise Fault(Code.GONE, reason="stream.closed")

        if wait is None:

            await self._queue.put(data)

        else:

            try: await asyncio.wait_for(self._queue.put(data), wait)
            except TimeoutError as error:

                raise Fault(Code.TIMEOUT, reason="stream.backpressure", unknown=True) from error

        self._written += len(data)

    def offer ( self, data: bytes ) -> bool:

        if self._closed: return False

        try: self._queue.put_nowait(data)
        except asyncio.QueueFull:

            self._dropped += 1

            return False

        self._written += len(data)

        return True

    async def close ( self ) -> None:

        self.cut()

    def cut ( self ) -> None:

        if self._closed: return

        self._closed = True

        with suppress(asyncio.QueueFull): self._queue.put_nowait(None)

    def closed ( self ) -> bool:

        return self._closed

    def pending ( self ) -> int:

        return self._queue.qsize()

    async def read ( self ) -> bytes | None:

        if self._closed and self._queue.empty(): return None

        piece = await self._queue.get()

        if piece is None and not self._queue.full(): self._queue.put_nowait(None)

        return piece

    def __aiter__ ( self ) -> Self:

        return self

    async def __anext__ ( self ) -> bytes:

        piece = await self.read()

        if piece is None: raise StopAsyncIteration

        return piece

    def describe ( self ) -> dict[str, Any]:

        return { "closed": self._closed, "pending": self.pending(), "written": self._written, "dropped": self._dropped }
