from collections.abc import AsyncIterator, Iterable, Mapping
from contextlib import asynccontextmanager
from typing import Any, cast

from engine.date import date
from engine.error import Code, Fault
from engine.log import log
from engine.rand import rand
from engine.thread import thread
from .arch import Hit, life, Loader, Loaders, LOCK_TTL, name, real, STALE, STEP, whole
from .memory import Memory
from .store import Store
from .tagged import Tagged
import asyncio, math

class Cache:

    def __init__ ( self, store: Store | None = None ) -> None:

        self._store: Store = Memory() if store is None else store
        self._local  = Memory()
        self._hits   = 0
        self._misses = 0
        self._waits: dict[str, asyncio.Lock] = {}

    def use ( self, store: Store ) -> None:

        if not hasattr(store, "get") or not hasattr(store, "set"): raise Fault(Code.INTERNAL, reason="cache.store")

        self._store = store

    def store ( self ) -> Store:

        return self._store

    def local ( self ) -> Memory:

        return self._local

    async def get ( self, key: str, default: Any = None ) -> Any:

        value = await self._store.get(key)

        if value is None:

            self._misses += 1

            return default

        self._hits += 1

        return value

    async def many ( self, keys: Iterable[str] ) -> dict[str, Any]:

        return await self._store.many(list(keys))

    async def set ( self, key: str, value: Any, ttl: float | None = None ) -> None:

        await self._store.set(key, self._valued_(value), ttl)

    async def set_many ( self, items: Mapping[str, Any], ttl: float | None = None ) -> None:

        for value in items.values(): self._valued_(value)

        await self._store.set_many(items, ttl)

    async def keys ( self, prefix: str = "", limit: int = 1000 ) -> list[str]:

        if type(prefix) is not str: raise Fault(Code.INTERNAL, reason="cache.prefix")

        return await self._store.keys(prefix, whole(limit, "limit"))

    async def touch ( self, key: str, ttl: float ) -> bool:

        return await self._store.expire(key, ttl)

    async def ttl ( self, key: str ) -> float | None:

        return await self._store.ttl(key)

    async def add ( self, key: str, value: Any, ttl: float | None = None ) -> bool:

        return await self._store.add(key, self._valued_(value), ttl)

    async def has ( self, key: str ) -> bool:

        return await self._store.get(key) is not None

    async def forget ( self, *keys: str ) -> int:

        return sum([await self._store.delete(key) for key in keys])

    async def take ( self, key: str, default: Any = None ) -> Any:

        value = await self._store.take(key)

        return default if value is None else value

    async def drop ( self, key: str, value: Any ) -> bool:

        return await self._store.drop(key, value)

    async def swap ( self, key: str, old: Any, new: Any, ttl: float | None = None ) -> bool:

        return await self._store.swap(key, old, self._valued_(new), ttl)

    async def increment ( self, key: str, step: int = 1, ttl: float | None = None ) -> int:

        return await self._store.increment(key, step, ttl)

    async def decrement ( self, key: str, step: int = 1 ) -> int:

        if type(step) is not int: raise Fault(Code.INTERNAL, reason="cache.step")

        return await self._store.increment(key, -step)

    async def remember [T] ( self, key: str, ttl: float | None, load: Loader[T] ) -> T:

        name(key)
        life(ttl)

        found = await self._store.get(key)

        if found is not None:

            self._hits += 1

            return cast("T", found)

        self._misses += 1

        lock = self._waits.setdefault(key, asyncio.Lock())

        try:

            async with lock:

                found = await self._store.get(key)

                if found is not None: return cast("T", found)

                value = await load()

                if value is not None: await self._store.set(key, value, ttl)

        finally:

            if self._waits.get(key) is lock: del self._waits[key]

        return value

    async def forever [T] ( self, key: str, load: Loader[T] ) -> T:

        return await self.remember(key, None, load)

    async def remember_many [T] ( self, keys: Iterable[str], ttl: float | None, load: Loaders[T] ) -> dict[str, T]:

        wanted = list(dict.fromkeys(keys))

        for key in wanted: name(key)

        life(ttl)

        found  = await self._store.many(wanted)
        missed = [key for key in wanted if key not in found]

        self._hits   += len(found)
        self._misses += len(missed)

        if missed:

            given  = dict(await load(missed))
            loaded = { key: value for key, value in given.items() if value is not None and key in missed }

            if loaded: await self._store.set_many(loaded, ttl)

            found.update(loaded)

        return { key: found[key] for key in wanted if key in found }

    async def stale [T] ( self, key: str, ttl: float, grace: float, load: Loader[T] ) -> T:

        name(key)

        span  = real(ttl, "ttl")
        extra = real(grace, "grace")
        found = await self._store.get(key)
        until = found.get(STALE) if isinstance(found, dict) and "value" in found else None

        if not isinstance(until, int | float) or type(until) is bool or not math.isfinite(until):

            self._misses += 1

            value = await load()

            await self._store.set(key, { STALE: date.stamp() + span, "value": value }, span + extra)

            return value

        self._hits += 1

        if until <= date.stamp() and await self._store.add(f"refresh:{key}", 1, extra):

            async def refresh () -> None:

                try:

                    value = await load()

                    await self._store.set(key, { STALE: date.stamp() + span, "value": value }, span + extra)

                finally: await self._store.delete(f"refresh:{key}")

            _ = thread.spawn(refresh(), f"cache.refresh:{key}")

        return cast("T", found["value"])

    @asynccontextmanager
    async def locked ( self, name_: str, ttl: float = LOCK_TTL, wait: float = 0.0 ) -> AsyncIterator[str]:

        token = await self.lock(name_, ttl, wait)

        if token is None: raise Fault(Code.CONFLICT, reason="cache.locked", errors={ "lock": [name_] })

        try: yield token
        finally: await self.unlock(name_, token)

    async def bucket ( self, key: str, rate: float, burst: int, cost: int = 1 ) -> Hit:

        name(key)

        speed: object = rate

        if type(burst) is not int or type(cost) is not int or burst < 1 or cost < 1: raise self._unset_("bucket")
        if not isinstance(speed, int | float) or type(speed) is bool or not math.isfinite(speed) or speed <= 0:

            raise self._unset_("bucket")

        allowed, left = await self._store.bucket(f"bucket:{key}", float(speed), burst, cost)

        return Hit(allowed, int(left), date.stamp() + (0.0 if allowed else (cost - left) / rate))

    def tags ( self, *names: str ) -> Tagged:

        if not names or not all(type(held) is str and held for held in names): raise self._unset_("tags")

        return Tagged(self._store, names)

    async def lock ( self, name_: str, ttl: float = LOCK_TTL, wait: float = 0.0, step: float = STEP ) -> str | None:

        name(name_)

        held: object = wait

        if life(ttl) is None: raise self._unset_("ttl")
        if not isinstance(held, int | float) or type(held) is bool: raise self._unset_("wait")
        if not 0 <= held < math.inf: raise self._unset_("wait")

        pause    = real(step, "step")
        token    = rand.hex(8)
        deadline = date.monotonic() + wait

        while True:

            if await self._store.add(f"lock:{name_}", token, ttl): return token
            if date.monotonic() >= deadline: return None

            await asyncio.sleep(pause)

    async def unlock ( self, name_: str, token: str ) -> bool:

        return await self._store.drop(f"lock:{name_}", token)

    async def renew ( self, name_: str, token: str, ttl: float = LOCK_TTL ) -> bool:

        if life(ttl) is None: raise self._unset_("ttl")

        return await self._store.swap(f"lock:{name_}", token, token, ttl)

    async def hit ( self, key: str, limit: int, window: float ) -> Hit:

        name(key)

        most   = whole(limit, "hit", 0)
        span   = real(window, "hit")
        bucket = int(date.stamp() // span)
        held   = f"hit:{key}:{bucket}"
        count  = await self._store.increment(held, 1, span + 1)
        reset  = (bucket + 1) * span

        return Hit(count <= most, max(0, most - count), reset)

    async def flush ( self, prefix: str = "" ) -> int:

        if type(prefix) is not str: raise Fault(Code.INTERNAL, reason="cache.prefix")

        return await self._store.clear(prefix)

    async def ping ( self ) -> bool:

        return await self._store.ping()

    async def close ( self ) -> None:

        await self._store.close()
        await self._local.close()

    def stats ( self ) -> dict[str, int]:

        return { "hits": self._hits, "misses": self._misses, "loading": len(self._waits) }

    def describe ( self ) -> dict[str, object]:

        log.debug("cache.describe", store=self._store.name)

        return { "store": self._store.name, **self.stats() }

    @staticmethod
    def _valued_ ( value: Any ) -> Any:

        if value is None: raise Fault(Code.INTERNAL, reason="cache.value")

        return value

    @staticmethod
    def _unset_ ( what: str ) -> Fault:

        return Fault(Code.INTERNAL, reason=f"cache.{what}")
