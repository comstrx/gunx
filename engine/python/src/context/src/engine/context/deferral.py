from collections import deque

from engine.error import Code, Fault
from .arch import LIMIT, Report, Work
import inspect

class Deferral:

    __slots__ = ("_items", "_running")

    def __init__ ( self ) -> None:

        self._items: deque[tuple[Work, bool]] | None = None
        self._running = False

    def add ( self, work: Work, always: bool = False ) -> int:

        if self._items is None: self._items = deque()
        if len(self._items) >= LIMIT: raise Fault(Code.INTERNAL, reason="context.full")

        self._items.append((work, always))

        return len(self._items)

    def pending ( self ) -> int:

        return len(self._items) if self._items else 0

    async def flush ( self, report: Report | None = None, failed: bool = False ) -> int:

        if self._running: raise Fault(Code.INTERNAL, reason="context.busy")

        self._running = True
        errors: list[Exception] = []
        ran = 0

        try:

            while self._items:

                work, always = self._items.popleft()

                if failed and not always: continue
                if ran == LIMIT:

                    try: await self._report_(Fault(Code.INTERNAL, reason="context.loop"), report, errors)
                    finally: self.clear()

                    break

                try:

                    result = work()

                    if inspect.isawaitable(result): await result

                except Exception as error: await self._report_(error, report, errors)

                ran += 1

            if errors: raise ExceptionGroup("deferred work failed", errors)

            return ran

        finally:

            if not self._items: self._items = None

            self._running = False

    def clear ( self ) -> int:

        count, self._items = self.pending(), None

        return count

    @staticmethod
    async def _report_ ( error: Exception, report: Report | None, errors: list[Exception] ) -> None:

        if report is None:

            errors.append(error)

            return

        try:

            result = report(error)

            if inspect.isawaitable(result): await result

        except Exception as failed: errors.extend((error, failed))
