from collections import deque
from collections.abc import Callable
from typing import Any

from .gate import Gate
from .pool import Pool
import asyncio, math, threading

class Lane:

    __slots__ = ("_gate", "_idle", "_lock", "_pools", "mode", "workers")

    def __init__ ( self, mode: str, workers: int ) -> None:

        self.mode    = mode
        self.workers = workers
        self._lock   = threading.Lock()
        self._pools: list[Pool] = []
        self._idle: deque[Pool] = deque()
        self._gate: tuple[asyncio.AbstractEventLoop, Gate] | None = None

    async def submit ( self, handler: Callable[..., Any], item: Any ) -> Any:

        gate = self._gated_()

        await gate.acquire(math.inf)

        with self._lock: pool = self._picked_()

        try: return await pool.submit(handler, item)
        except asyncio.CancelledError:

            if self.mode == "process": pool.close(kill=True)

            raise

        finally:

            with self._lock:

                if pool.busy(): self._idle.appendleft(pool)
                else: self._idle.append(pool)

            gate.release()

    def live ( self ) -> bool:

        return any(pool.live() for pool in self._pools)

    def close ( self, kill: bool = False ) -> None:

        for pool in self._pools: pool.close(kill)

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

    def _gated_ ( self ) -> Gate:

        loop = asyncio.get_running_loop()
        held = self._gate

        if held is None or held[0] is not loop: held = self._gate = (loop, Gate(self.workers))

        return held[1]
