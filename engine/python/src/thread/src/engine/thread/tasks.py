from collections.abc import Coroutine
from typing import Any, cast

from engine.error import Code, Fault
from engine.log import log
from .arch import DRAIN, GRACE, WORD
import asyncio, inspect, math

class Tasks:

    def __init__ ( self, name: str = "tasks" ) -> None:

        if type(name) is not str or not 0 < len(name) <= WORD: raise Fault(Code.INTERNAL, reason="thread.name")

        self.name   = name
        self._tasks: set[asyncio.Task[Any]] = set()

    def spawn [T] ( self, coroutine: Coroutine[Any, Any, T], name: str | None = None ) -> asyncio.Task[T]:

        if not inspect.iscoroutine(cast("object", coroutine)): raise Fault(Code.INTERNAL, reason="thread.work")

        try: loop = self._loop_(name)
        except Fault:

            coroutine.close()

            raise

        task = loop.create_task(coroutine, name=name)

        self._tasks.add(task)
        task.add_done_callback(self._done_)

        return task

    def count ( self ) -> int:

        return len(self._tasks)

    async def close ( self, grace: float = GRACE ) -> int:

        wait    = self._seconds_(grace)
        loop    = asyncio.get_running_loop()
        current = asyncio.current_task()
        own     = { task for task in self._tasks if task.get_loop() is loop and task is not current }
        others  = { task for task in self._tasks if task.get_loop() is not loop }

        for task in own: task.cancel()

        for task in others: self._parted_(task)

        if own:

            _, stuck = await asyncio.wait(own, timeout=None if wait == math.inf else wait)

            if stuck: log.warning("task.stuck", name=self.name, count=len(stuck))

        return len(own) + len(others)

    async def drain ( self, grace: float = DRAIN ) -> int:

        wait    = self._seconds_(grace)
        loop    = asyncio.get_running_loop()
        current = asyncio.current_task()
        until   = loop.time() + wait
        count   = 0

        while True:

            tasks = { task for task in self._tasks if task.get_loop() is loop and task is not current }
            left  = until - loop.time()

            if not tasks or left <= 0: return count

            done, _ = await asyncio.wait(tasks, timeout=None if left == math.inf else left)
            count  += len(done)

    def _parted_ ( self, task: asyncio.Task[Any] ) -> None:

        loop = task.get_loop()

        if loop.is_closed(): self._tasks.discard(task)
        else: loop.call_soon_threadsafe(task.cancel)

    def _loop_ ( self, name: str | None ) -> asyncio.AbstractEventLoop:

        if name is not None and (type(name) is not str or len(name) > WORD):

            raise Fault(Code.INTERNAL, reason="thread.name")

        try: return asyncio.get_running_loop()
        except RuntimeError as error: raise Fault(Code.INTERNAL, reason="thread.loop") from error

    def _seconds_ ( self, grace: float ) -> float:

        if (type(grace) is not float and type(grace) is not int) or not grace >= 0:

            raise Fault(Code.INTERNAL, reason="thread.seconds")

        return float(grace)

    def _done_ ( self, task: asyncio.Task[Any] ) -> None:

        self._tasks.discard(task)

        if task.cancelled(): return

        error = task.exception()

        if error is not None: log.error("task.failed", task=task.get_name(), kind=type(error).__name__, name=self.name)
