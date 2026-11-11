from typing import Any

from engine.error import Code, Fault
from .pipe import Pipe

class Tee:

    def __init__ ( self, capacity: int = 64, drop: bool = True ) -> None:

        self._capacity = capacity
        self._drop     = drop
        self._pipes: dict[int, Pipe] = {}
        self._next     = 0
        self._closed   = False

    def subscribe ( self ) -> tuple[int, Pipe]:

        if self._closed: raise Fault(Code.GONE, reason="stream.closed")

        self._next += 1

        made = Pipe(self._capacity)

        self._pipes[self._next] = made

        return self._next, made

    def unsubscribe ( self, token: int ) -> bool:

        found = self._pipes.pop(token, None)

        if found is None: return False

        found.cut()

        return True

    async def write ( self, data: bytes ) -> int:

        if self._closed: raise Fault(Code.GONE, reason="stream.closed")

        delivered = 0

        for pipe in list(self._pipes.values()):

            if self._drop: delivered += 1 if pipe.offer(data) else 0
            else:

                await pipe.write(data)

                delivered += 1

        return delivered

    async def close ( self ) -> None:

        self._closed = True

        for pipe in self._pipes.values(): await pipe.close()

        self._pipes = {}

    def count ( self ) -> int:

        return len(self._pipes)

    def describe ( self ) -> dict[str, Any]:

        return { "subscribers": self.count(), "drop": self._drop, "closed": self._closed }
