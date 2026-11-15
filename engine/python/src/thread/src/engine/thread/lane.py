from collections import deque
from collections.abc import Callable
from typing import Any

from .arch import DRAIN, bounds, seconds
from .capacity import Capacity
from .pool import Pool
import asyncio, threading

class Lane:

    __slots__ = ("_capacity", "_idle", "_lock", "_pools", "mode", "workers")

    def __init__ ( self, mode: str, workers: int ) -> None:

        bounds(mode, workers)

        self.mode    = mode
        self.workers = workers
        self._lock   = threading.Lock()
        self._pools: list[Pool] = []
        self._idle: deque[Pool] = deque()
        self._capacity = Capacity(workers)

    async def submit ( self, handler: Callable[..., Any], item: Any ) -> Any:

        capacity = self._capacity

        await capacity.acquire()

        pool: Pool | None = None

        try:

            with self._lock: pool = self._picked_()

            return await pool.submit(handler, item)
        except asyncio.CancelledError:

            if self.mode == "process" and pool is not None: pool.close(kill=True)

            raise

        finally:

            if pool is not None:

                with self._lock:

                    if pool.busy(): self._idle.appendleft(pool)
                    else: self._idle.append(pool)

            capacity.release()

    def live ( self ) -> bool:

        return any(pool.live() for pool in self._pools)

    async def join ( self, grace: float = DRAIN ) -> None:

        loop = asyncio.get_running_loop()
        until = loop.time() + seconds(grace)

        with self._lock: pools = tuple(self._pools)

        for pool in pools: await pool.join(max(0.0, until - loop.time()))

    def close ( self, kill: bool = False ) -> None:

        with self._lock: pools = tuple(self._pools)

        for pool in pools: pool.close(kill)

    def describe ( self ) -> dict[str, Any]:

        return { "mode": self.mode, "workers": self.workers, "live": sum(1 for pool in self._pools if pool.live()) }

    def _picked_ ( self ) -> Pool:

        idle = self._idle

        if idle and not idle[-1].busy(): return idle.pop()
        if len(self._pools) < self.workers: return self._opened_()

        for pool in idle:

            if not pool.busy():

                idle.remove(pool)

                return pool

        return idle.pop() if idle else self._opened_()

    def _opened_ ( self ) -> Pool:

        made = Pool(self.mode, 1)

        self._pools.append(made)

        return made

