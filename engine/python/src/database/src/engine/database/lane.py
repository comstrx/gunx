from collections import deque
from typing import Any

from engine.error import Code, Fault
from .arch import Closer, LANE_RECYCLE, Opener
import asyncio, contextlib, time

class Lane:

    def __init__ ( self, opener: Opener, closer: Closer, low: int, high: int, recycle: float = LANE_RECYCLE ) -> None:

        self._opener  = opener
        self._closer  = closer
        self._low     = max(1, low)
        self._high    = max(self._low, high)
        self._recycle = recycle
        self._idle: list[tuple[Any, float]] = []
        self._size    = 0
        self._waiters: deque[tuple[asyncio.Future[Any], float, float]] = deque()
        self._timer: asyncio.TimerHandle | None = None
        self._closed  = False

    async def open ( self ) -> None:

        for _ in range(self._low):

            self._size += 1

            self._idle.append((await self._open_(), time.monotonic()))

    async def acquire ( self, wait: float ) -> Any:

        if self._closed: raise Fault(Code.UNAVAILABLE, reason="database.closed")

        while self._idle:

            connection, since = self._idle.pop()

            if not self._stale_(connection, since): return connection

            await self._discard_(connection)

        if self._size < self._high:

            self._size += 1

            return await self._open_()

        loop  = asyncio.get_running_loop()
        entry = (loop.create_future(), loop.time() + wait, wait)

        self._waiters.append(entry)
        self._arm_(loop, entry[1])

        try: connection = await entry[0]
        except asyncio.CancelledError:

            self._pass_(entry)

            raise

        return await self._open_() if connection is None else connection

    def take ( self ) -> Any:

        if self._closed or not self._idle: return None

        connection, since = self._idle[-1]

        if connection.is_closed() or time.monotonic() - since > self._recycle: return None

        self._idle.pop()

        return connection

    def give ( self, connection: Any ) -> bool:

        if self._closed or connection.is_closed() or connection.is_in_transaction(): return False

        if self._waiters: self._hand_(connection)
        else: self._idle.append((connection, time.monotonic()))

        return True

    async def release ( self, connection: Any ) -> None:

        if self._closed or connection.is_closed():

            await self._discard_(connection)

            return

        if connection.is_in_transaction():

            try: await connection.execute("ROLLBACK")
            except Exception:

                await self._discard_(connection)

                return

            except BaseException:

                self._drop_(connection)

                raise

        self._hand_(connection)

    async def close ( self ) -> None:

        self._closed = True

        if self._timer is not None:

            self._timer.cancel()

            self._timer = None

        while self._waiters:

            future, _, _ = self._waiters.popleft()

            if not future.done(): future.set_exception(Fault(Code.UNAVAILABLE, reason="database.closed"))

        idle, self._idle = self._idle, []

        await asyncio.gather(*(self._discard_(connection) for connection, _ in idle))

    def size ( self ) -> int:

        return self._size

    def idle ( self ) -> int:

        return len(self._idle)

    def closed ( self ) -> bool:

        return self._closed

    def waiting ( self ) -> int:

        return len(self._waiters)

    async def _open_ ( self ) -> Any:

        try: return await self._opener()
        except BaseException:

            self._free_()

            raise

    async def _discard_ ( self, connection: Any ) -> None:

        try: await self._closer(connection)
        except Exception: connection.terminate()
        except BaseException:

            connection.terminate()

            raise

        finally: self._free_()

    def _drop_ ( self, connection: Any ) -> None:

        connection.terminate()

        self._free_()

    def _free_ ( self ) -> None:

        self._size = max(0, self._size - 1)

        while self._waiters and self._size < self._high:

            future, _, _ = self._waiters.popleft()

            if future.done(): continue

            self._size += 1

            future.set_result(None)

    def _hand_ ( self, connection: Any ) -> None:

        if self._closed:

            self._drop_(connection)

            return

        while self._waiters:

            future, _, _ = self._waiters.popleft()

            if not future.done():

                future.set_result(connection)

                return

        self._idle.append((connection, time.monotonic()))

    def _pass_ ( self, entry: tuple[asyncio.Future[Any], float, float] ) -> None:

        future = entry[0]

        if future.cancelled():

            with contextlib.suppress(ValueError): self._waiters.remove(entry)

            return

        if future.exception() is not None: return

        held = future.result()

        if held is None: self._free_()
        else: self._hand_(held)

    def _arm_ ( self, loop: asyncio.AbstractEventLoop, deadline: float ) -> None:

        if self._timer is not None:

            if self._timer.when() <= deadline: return

            self._timer.cancel()

        self._timer = loop.call_at(deadline, self._sweep_, loop)

    def _sweep_ ( self, loop: asyncio.AbstractEventLoop ) -> None:

        self._timer = None
        now         = loop.time()
        kept: deque[tuple[asyncio.Future[Any], float, float]] = deque()

        for entry in self._waiters:

            future, deadline, wait = entry

            if future.done(): continue

            if deadline > now: kept.append(entry)
            else: future.set_exception(Fault(Code.UNAVAILABLE, reason="database.busy", retry_after=wait, unknown=True))

        self._waiters = kept

        if kept: self._timer = loop.call_at(min(deadline for _, deadline, _ in kept), self._sweep_, loop)

    def _stale_ ( self, connection: Any, since: float ) -> bool:

        return connection.is_closed() or time.monotonic() - since > self._recycle
