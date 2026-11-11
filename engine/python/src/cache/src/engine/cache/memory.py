from collections.abc import Iterable, Mapping
from typing import Any

from engine.date import date
from engine.error import Code, Fault
from .arch import life, MAX_ITEMS, name, PAIR
import cachebox

class Memory:

    name = "memory"

    def __init__ ( self, size: int = MAX_ITEMS ) -> None:

        if type(size) is not int or size < 1: raise Fault(Code.INTERNAL, reason="cache.size")

        self._items: cachebox.VTTLCache[str, Any] = cachebox.VTTLCache(size)

    async def get ( self, key: str ) -> Any:

        return self._items.get(key) if type(key) is str else None

    async def many ( self, keys: Iterable[str] ) -> dict[str, Any]:

        found = { key: self._items.get(key) for key in keys if type(key) is str }

        return { key: value for key, value in found.items() if value is not None }

    async def set ( self, key: str, value: Any, ttl: float | None = None ) -> None:

        name(key)

        self._items.insert(key, value, ttl=life(ttl))

    async def add ( self, key: str, value: Any, ttl: float | None = None ) -> bool:

        name(key)

        kept = life(ttl)

        if self._items.get(key) is not None: return False

        self._items.insert(key, value, ttl=kept)

        return True

    async def delete ( self, key: str ) -> bool:

        return type(key) is str and self._items.pop(key, None) is not None

    async def take ( self, key: str ) -> Any:

        return self._items.pop(key, None) if type(key) is str else None

    async def drop ( self, key: str, value: Any ) -> bool:

        found = self._items.get(key) if type(key) is str else None

        if found is None or found != value: return False

        return self._items.pop(key, None) is not None

    async def swap ( self, key: str, old: Any, new: Any, ttl: float | None = None ) -> bool:

        name(key)

        kept        = life(ttl)
        found, left = self._items.get_with_expire(key)

        if found is None or found != old: return False

        self._items.insert(key, new, ttl=kept or (left if left and left > 0 else None))

        return True

    async def increment ( self, key: str, step: int = 1, ttl: float | None = None ) -> int:

        name(key)

        kept          = life(ttl)
        current, left = self._items.get_with_expire(key)

        if type(step) is not int: raise Fault(Code.INTERNAL, reason="cache.step")
        if current is not None and type(current) is not int: raise Fault(Code.INTERNAL, reason="cache.type")

        value = (current or 0) + step

        self._items.insert(key, value, ttl=left if current is not None and left and left > 0 else kept)

        return value

    async def bucket ( self, key: str, rate: float, burst: int, cost: int = 1 ) -> tuple[bool, float]:

        name(key)

        now  = date.monotonic()
        held = self._items.get(key)

        if held is None: held = (float(burst), now)
        if not isinstance(held, tuple) or len(held) != PAIR: raise Fault(Code.INTERNAL, reason="cache.type")

        left    = min(float(burst), held[0] + (now - held[1]) * rate)
        allowed = left >= cost

        if allowed: left -= cost

        self._items.insert(key, (left, now), ttl=max(1.0, burst / rate * 2))

        return allowed, left

    async def expire ( self, key: str, ttl: float ) -> bool:

        name(key)

        kept  = life(ttl)
        value = self._items.get(key)

        if value is None or kept is None: return False

        self._items.insert(key, value, ttl=kept)

        return True

    async def ttl ( self, key: str ) -> float | None:

        if type(key) is not str: return None

        value, left = self._items.get_with_expire(key)

        return None if value is None or not left or left <= 0 else float(left)

    async def set_many ( self, items: Mapping[str, Any], ttl: float | None = None ) -> None:

        kept = life(ttl)

        for key in items: name(key)
        for key, value in items.items(): self._items.insert(key, value, ttl=kept)

    async def keys ( self, prefix: str = "", limit: int = 1000 ) -> list[str]:

        found = [key for key in list(self._items.keys()) if key.startswith(prefix)]

        return sorted(found)[:limit]

    async def clear ( self, prefix: str = "" ) -> int:

        if not prefix:

            count = len(self._items)

            self._items.clear()

            return count

        keys = [key for key in list(self._items.keys()) if key.startswith(prefix)]

        for key in keys: self._items.pop(key, None)

        return len(keys)

    async def ping ( self ) -> bool:

        return True

    async def close ( self ) -> None:

        self._items.clear()

    def __len__ ( self ) -> int:

        return len(self._items)
