from collections.abc import Hashable
from typing import Any, cast

from engine.error import Code, Fault
from .arch import Work
import asyncio, time

class Memo:

    def __init__ ( self, ttl: float = 60.0, size: int = 1024 ) -> None:

        if not ttl >= 0 or size < 1: raise Fault(Code.INTERNAL, reason="func.memo")

        self._ttl   = ttl
        self._size  = size
        self._items: dict[Hashable, tuple[float, Any]] = {}
        self._locks: dict[Hashable, list[Any]] = {}

    async def remember [T] ( self, key: Hashable, load: Work[T] ) -> T:

        found = self._items.get(key)

        if found is not None and found[0] > time.monotonic(): return cast("T", found[1])

        held = self._locks.get(key)

        if held is None: held = self._locks[key] = [asyncio.Lock(), 0]

        held[1] += 1

        try:

            async with held[0]:

                found = self._items.get(key)

                if found is not None and found[0] > time.monotonic(): return cast("T", found[1])

                value = await load()

                self.set(key, value)

        finally:

            held[1] -= 1

            if not held[1]: self._locks.pop(key, None)

        return value

    def get ( self, key: Hashable, default: Any = None ) -> Any:

        found = self._items.get(key)

        return found[1] if found is not None and found[0] > time.monotonic() else default

    def set ( self, key: Hashable, value: Any, ttl: float | None = None ) -> None:

        self._items.pop(key, None)

        if len(self._items) >= self._size: self._items.pop(next(iter(self._items)))

        self._items[key] = (time.monotonic() + (self._ttl if ttl is None else ttl), value)

    def has ( self, key: Hashable ) -> bool:

        found = self._items.get(key)

        return found is not None and found[0] > time.monotonic()

    def forget ( self, key: Hashable ) -> bool:

        return self._items.pop(key, None) is not None

    def clear ( self ) -> int:

        count, self._items = len(self._items), {}

        return count

    def __len__ ( self ) -> int:

        return len(self._items)
