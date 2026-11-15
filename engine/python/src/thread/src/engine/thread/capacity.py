from collections import deque
from concurrent.futures import Future

from engine.error import Code, Fault
import asyncio, contextlib, threading

class Capacity:

    __slots__ = ("_closed", "_free", "_lock", "_waiters")

    def __init__ ( self, limit: int ) -> None:

        self._free = limit
        self._closed = False
        self._lock = threading.Lock()
        self._waiters: deque[Future[None]] = deque()

    async def acquire ( self ) -> None:

        with self._lock:

            if self._closed: raise Fault(Code.UNAVAILABLE, reason="thread.broken")
            if self._free:

                self._free -= 1

                return

            future: Future[None] = Future()

            self._waiters.append(future)

        try: await asyncio.wrap_future(future)
        except asyncio.CancelledError:

            with self._lock:

                reserved = future.done() and not future.cancelled() and future.exception() is None

                if not future.done(): future.cancel()
                if not reserved:

                    with contextlib.suppress(ValueError): self._waiters.remove(future)

            if reserved: self.release()

            raise

    def release ( self ) -> None:

        with self._lock:

            while self._waiters:

                future = self._waiters.popleft()

                if future.set_running_or_notify_cancel():

                    future.set_result(None)

                    return

            self._free += 1

    def close ( self ) -> None:

        with self._lock:

            self._closed = True

            while self._waiters:

                future = self._waiters.popleft()

                if not future.done(): future.set_exception(Fault(Code.UNAVAILABLE, reason="thread.broken"))
