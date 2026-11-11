from collections.abc import Sequence

from engine.error import Code, Fault
from .arch import Flush
import asyncio, math

class Batch [T, R]:

    def __init__ ( self, flush: Flush[T, R], size: int = 64, delay: float = 0.0 ) -> None:

        if size < 1 or not 0 <= delay < math.inf: raise Fault(Code.INTERNAL, reason="func.batch")

        self._flush = flush
        self._size  = size
        self._delay = delay
        self._items: list[tuple[T, asyncio.Future[R]]] = []
        self._timer: asyncio.Handle | None = None
        self._runs: set[asyncio.Task[None]] = set()

    async def put ( self, item: T ) -> R:

        loop = asyncio.get_running_loop()
        seat: asyncio.Future[R] = loop.create_future()

        self._items.append((item, seat))

        if len(self._items) >= self._size: self._fire_()
        elif self._timer is None:

            self._timer = loop.call_later(self._delay, self._fire_) if self._delay else loop.call_soon(self._fire_)

        return await seat

    async def flush ( self ) -> None:

        self._fire_()

        if self._runs: await asyncio.gather(*self._runs, return_exceptions=True)

    def pending ( self ) -> int:

        return len(self._items)

    def _fire_ ( self ) -> None:

        if self._timer is not None:

            self._timer.cancel()

            self._timer = None

        items, self._items = self._items, []
        live = [(item, seat) for item, seat in items if not seat.done()]

        if not live: return

        run = asyncio.get_running_loop().create_task(self._run_(live))

        self._runs.add(run)
        run.add_done_callback(self._runs.discard)

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

        for (_, seat), value in zip(live, found, strict=True):

            if not seat.done(): seat.set_result(value)

    @staticmethod
    def _matched_ ( found: Sequence[R], wanted: int ) -> Sequence[R]:

        if len(found) == wanted: return found

        raise Fault(Code.INTERNAL, reason="func.batch", errors={ "results": [str(len(found))] })
