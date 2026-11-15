from .base import Base
from collections.abc import Hashable
from typing import Any, cast

from engine.error import Code, Fault
from .arch import Lease, Work
import asyncio, time

class Memo:

    __slots__ = ("_items", "_locks", "_size", "_ttl")

    def __init__ ( self, ttl: float = 60.0, size: int = 1024 ) -> None:

        self._ttl   = Base.span(ttl, "func.memo", infinite=True)
        self._size  = Base.count(size, "func.memo")
        self._items: dict[Hashable, tuple[float, Any]] = {}
        self._locks: dict[Hashable, Lease] = {}

    async def remember [T] ( self, key: Hashable, load: Work[T] ) -> T:

        found = self._items.get(key)

        if found is not None and found[0] > time.monotonic(): return cast("T", found[1])

        loop = asyncio.get_running_loop()
        held = self._locks.get(key)

        if held is None: held = self._locks[key] = Lease(loop)
        elif held.loop is not loop: raise Fault(Code.CONFLICT, reason="func.loop")

        held.users += 1

        try:

            async with held.lock:

                found = self._items.get(key)

                if found is not None and found[0] > time.monotonic(): return cast("T", found[1])

                value = await load()

                if held.valid: self._store_(key, value, self._ttl)

        finally:

            held.users -= 1

            if not held.users and self._locks.get(key) is held: self._locks.pop(key)

        return value

    def get ( self, key: Hashable, default: Any = None ) -> Any:

        found = self._items.get(key)

        return found[1] if found is not None and found[0] > time.monotonic() else default

    def set ( self, key: Hashable, value: Any, ttl: float | None = None ) -> None:

        wait = self._ttl if ttl is None else Base.span(ttl, "func.memo", infinite=True)

        self._invalid_(key)
        self._store_(key, value, wait)

    def has ( self, key: Hashable ) -> bool:

        found = self._items.get(key)

        return found is not None and found[0] > time.monotonic()

    def forget ( self, key: Hashable ) -> bool:

        self._invalid_(key)

        return self._items.pop(key, None) is not None

    def clear ( self ) -> int:

        for held in self._locks.values(): held.valid = False

        self._locks = {}
        count, self._items = len(self._items), {}

        return count

    def prune ( self ) -> int:

        now = time.monotonic()
        expired = [key for key, (until, _) in self._items.items() if until <= now]

        for key in expired: del self._items[key]

        return len(expired)

    def _store_ ( self, key: Hashable, value: Any, wait: float ) -> None:

        self._items.pop(key, None)

        if len(self._items) >= self._size: self._items.pop(next(iter(self._items)))

        self._items[key] = (time.monotonic() + wait, value)

    def _invalid_ ( self, key: Hashable ) -> None:

        held = self._locks.pop(key, None)

        if held is not None: held.valid = False

    def __len__ ( self ) -> int:

        return len(self._items)
