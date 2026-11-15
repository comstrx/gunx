from .base import Base
from collections.abc import Sequence
from itertools import islice

from engine.error import Code, Fault
from engine.thread import Gate
from .arch import Flush
import asyncio, math

class Batch [T, R]:

    __slots__ = ("_delay", "_flush", "_gate", "_items", "_loop", "_runs", "_size", "_timer", "_workers")

    def __init__ (
        self, flush: Flush[T, R], size: int = 64, delay: float = 0.0, *, workers: int = 1,
    ) -> None:

        if not callable(flush): raise Fault(Code.INTERNAL, reason="func.batch")

        self._flush   = flush
        self._size    = Base.count(size, "func.batch")
        self._delay   = Base.span(delay, "func.batch")
        self._workers = Base.count(workers, "func.batch")
        self._gate    = Gate(size * workers)
        self._loop: asyncio.AbstractEventLoop | None = None
        self._items: dict[asyncio.Future[R], T] = {}
        self._timer: asyncio.Handle | None = None
        self._runs: set[asyncio.Task[None]] = set()

    async def put ( self, item: T ) -> R:

        loop = asyncio.get_running_loop()

        if self._loop is not None and self._loop is not loop: raise Fault(Code.CONFLICT, reason="func.loop")

        self._loop = loop

        if not self._gate.take(): await self._gate.acquire(math.inf)

        seat: asyncio.Future[R] = loop.create_future()
        self._items[seat] = item

        try:

            if len(self._items) >= self._size: self._fire_()
            elif self._timer is None:

                self._timer = loop.call_later(self._delay, self._fire_) if self._delay else loop.call_soon(self._fire_)

            return await seat

        finally:

            if seat in self._items:

                del self._items[seat]

                self._gate.release()

    async def flush ( self ) -> None:

        self._fire_()

        while self._runs:

            runs = tuple(self._runs)

            await asyncio.gather(*runs, return_exceptions=True)

            self._runs.difference_update(runs)
            self._fire_()

    def pending ( self ) -> int:

        return len(self._items)

    def _fire_ ( self ) -> None:

        if self._timer is not None:

            self._timer.cancel()

            self._timer = None

        if len(self._runs) >= self._workers: return

        live: list[tuple[T, asyncio.Future[R]]] = []

        for seat in list(islice(self._items, self._size)):

            item = self._items.pop(seat)

            if seat.done(): self._gate.release()
            else: live.append((item, seat))

        if not live:

            if self._items: self._timer = asyncio.get_running_loop().call_soon(self._fire_)

            return

        work = self._run_(live)

        try: run = asyncio.get_running_loop().create_task(work)
        except BaseException as error:

            work.close()

            for _, seat in live:

                if not seat.done(): seat.set_exception(error)

                self._gate.release()

            return

        self._runs.add(run)
        run.add_done_callback(self._done_)

    def _done_ ( self, run: asyncio.Task[None] ) -> None:

        self._runs.discard(run)

        if not run.cancelled(): run.exception()
        if self._items: self._fire_()

    async def _run_ ( self, live: list[tuple[T, asyncio.Future[R]]] ) -> None:

        try:

            found = self._matched_(await self._flush([item for item, _ in live]), len(live))

        except asyncio.CancelledError:

            for _, seat in live: seat.cancel()

            raise

        except Exception as error:

            for _, seat in live:

                if not seat.done(): seat.set_exception(error)

            return

        finally:

            for _ in live: self._gate.release()

        for (_, seat), value in zip(live, found, strict=True):

            if not seat.done(): seat.set_result(value)

    @staticmethod
    def _matched_ ( found: Sequence[R], wanted: int ) -> Sequence[R]:

        if len(found) == wanted: return found

        raise Fault(Code.INTERNAL, reason="func.batch", errors={ "results": [str(len(found))] })
