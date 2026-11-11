from collections import deque
from typing import Any

from engine.error import Code, Fault
import asyncio, math

class Gate:

    __slots__ = ("_due", "_limit", "_ragged", "_timer", "_value", "_waiters")

    def __init__ ( self, limit: int ) -> None:

        if type(limit) is not int or limit < 1: raise Fault(Code.INTERNAL, reason="thread.limit")

        self._limit   = limit
        self._value   = limit
        self._due     = math.inf
        self._ragged  = False
        self._waiters: deque[tuple[asyncio.Future[None], float]] = deque()
        self._timer: asyncio.TimerHandle | None = None

    def limit ( self ) -> int:

        return self._limit

    def free ( self ) -> int:

        return self._value

    def waiting ( self ) -> int:

        return sum(1 for future, _ in self._waiters if not future.done())

    def locked ( self ) -> bool:

        return self._value <= 0

    def take ( self ) -> bool:

        if self._value <= 0 or self._waiters: return False

        self._value -= 1

        return True

    async def acquire ( self, wait: float ) -> None:

        if (type(wait) is not float and type(wait) is not int) or not wait >= 0:

            raise Fault(Code.INTERNAL, reason="thread.seconds")

        if self.take(): return
        if wait == 0: raise TimeoutError("gate")

        loop     = asyncio.get_running_loop()
        deadline = loop.time() + wait
        waiters  = self._waiters
        future: asyncio.Future[None] = loop.create_future()

        if waiters and deadline < waiters[-1][1]: self._ragged = True

        waiters.append((future, deadline))

        if deadline < self._due: self._arm_(loop, deadline)

        try: await future
        except asyncio.CancelledError:

            if future.done() and not future.cancelled() and future.exception() is None: self.release()

            raise

    def release ( self ) -> None:

        waiters = self._waiters

        while waiters:

            future, _ = waiters.popleft()

            if not future.done():

                future.set_result(None)

                return

        self._ragged = False

        if self._value < self._limit: self._value += 1

    def describe ( self ) -> dict[str, Any]:

        return { "limit": self._limit, "free": self._value, "waiting": self.waiting() }

    def _arm_ ( self, loop: asyncio.AbstractEventLoop, deadline: float ) -> None:

        if self._timer is not None: self._timer.cancel()

        self._due   = deadline
        self._timer = loop.call_at(deadline, self._sweep_, loop)

    def _sweep_ ( self, loop: asyncio.AbstractEventLoop ) -> None:

        self._timer = None
        self._due   = math.inf
        now         = loop.time()
        waiters     = self._combed_(now) if self._ragged else self._fronted_(now)

        if not waiters:

            self._ragged = False

            return

        due = min(deadline for _, deadline in waiters) if self._ragged else waiters[0][1]

        if due != math.inf: self._arm_(loop, due)

    def _fronted_ ( self, now: float ) -> deque[tuple[asyncio.Future[None], float]]:

        waiters = self._waiters

        while waiters and (waiters[0][0].done() or waiters[0][1] <= now):

            future, _ = waiters.popleft()

            if not future.done(): future.set_exception(TimeoutError("gate"))

        return waiters

    def _combed_ ( self, now: float ) -> deque[tuple[asyncio.Future[None], float]]:

        kept: deque[tuple[asyncio.Future[None], float]] = deque()

        for future, deadline in self._waiters:

            if future.done(): continue

            if deadline <= now: future.set_exception(TimeoutError("gate"))
            else: kept.append((future, deadline))

        self._waiters = kept

        return kept
