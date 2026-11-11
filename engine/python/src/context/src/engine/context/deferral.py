from engine.error import Code, Fault
from .arch import LIMIT, Report, Work
import inspect

class Deferral:

    __slots__ = ("_items",)

    def __init__ ( self ) -> None:

        self._items: list[tuple[Work, bool]] = []

    def add ( self, work: Work, always: bool = False ) -> int:

        if len(self._items) >= LIMIT: raise Fault(Code.INTERNAL, reason="context.full")

        self._items.append((work, always))

        return len(self._items)

    def pending ( self ) -> int:

        return len(self._items)

    async def flush ( self, report: Report | None = None, failed: bool = False ) -> int:

        errors: list[Exception] = []
        tell   = errors.append if report is None else report
        ran    = 0

        while self._items and ran < LIMIT: ran += await self._pass_(tell, failed)

        if self.clear(): tell(Fault(Code.INTERNAL, reason="context.loop"))
        if errors: raise ExceptionGroup("deferred work failed", errors)

        return ran

    def clear ( self ) -> int:

        count, self._items = len(self._items), []

        return count

    async def _pass_ ( self, tell: Report, failed: bool ) -> int:

        items, self._items = self._items, []
        ran = 0

        for at, (work, always) in enumerate(items):

            if failed and not always: continue

            try:

                result = work()

                if inspect.isawaitable(result): await result

            except Exception as error: tell(error)
            except BaseException:

                self._items[:0] = items[at + 1:]

                raise

            ran += 1

        return ran
