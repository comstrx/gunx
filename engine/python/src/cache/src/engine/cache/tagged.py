from typing import Any, cast
from .arch import Loader
from .store import Store


class Tagged:

    def __init__ ( self, store: Store, names: tuple[str, ...] ) -> None:

        self._store = store
        self._names = tuple(sorted(set(names)))

    def names ( self ) -> tuple[str, ...]:

        return self._names

    async def version ( self ) -> str:

        found = await self._store.many(f"tag:{name}" for name in self._names)

        return ".".join(str(found.get(f"tag:{name}") or 0) for name in self._names)

    async def key ( self, key: str ) -> str:

        return f"tagged:{'+'.join(self._names)}:{await self.version()}:{key}"

    async def get ( self, key: str, default: Any = None ) -> Any:

        value = await self._store.get(await self.key(key))

        return default if value is None else value

    async def set ( self, key: str, value: Any, ttl: float | None = None ) -> None:

        await self._store.set(await self.key(key), value, ttl)

    async def remember [T] ( self, key: str, ttl: float | None, load: Loader[T] ) -> T:

        scoped = await self.key(key)
        found  = await self._store.get(scoped)

        if found is not None: return cast("T", found)

        value = await load()

        await self._store.set(scoped, value, ttl)

        return value

    async def forget ( self, key: str ) -> bool:

        return await self._store.delete(await self.key(key))

    async def flush ( self ) -> int:

        for name in self._names: await self._store.increment(f"tag:{name}")

        return len(self._names)
