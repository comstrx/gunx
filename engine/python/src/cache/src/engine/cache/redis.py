from collections.abc import AsyncIterator, Iterable, Mapping
from typing import Any

from engine.crypto import crypto
from engine.error import Code, Fault
from engine.json import json
from .arch import BUCKET, COUNT, DROP, GLOB, life, name, RAW, SWAP, whole
from .wire import Wire

class Redis:

    name = "redis"

    def __init__ ( self, url: str, prefix: str = "", pool: int = 32, wait: float = 2.0 ) -> None:

        if type(prefix) is not str: raise Fault(Code.INTERNAL, reason="cache.prefix")

        self._prefix = prefix
        self._wire   = Wire(url, wait, whole(pool, "pool") * 16)
        self._digests: dict[str, str] = {}

    def key ( self, key: str ) -> str:

        return f"{self._prefix}{key}"

    def client ( self ) -> Wire:

        return self._wire

    async def get ( self, key: str ) -> Any:

        if type(key) is not str: return None

        return self._decode_(await self._wire.send("GET", self._prefix + key))

    async def many ( self, keys: Iterable[str] ) -> dict[str, Any]:

        names = [key for key in keys if type(key) is str]

        if not names: return {}

        prefix = self._prefix
        values = await self._wire.send("MGET", *([prefix + name for name in names] if prefix else names))

        return { key: self._decode_(raw) for key, raw in zip(names, values, strict=True) if raw is not None }

    async def set ( self, key: str, value: Any, ttl: float | None = None ) -> None:

        name(key)

        px = self._px_(ttl)

        if px is None: await self._wire.send("SET", self._prefix + key, self._encode_(value))
        else: await self._wire.send("SET", self._prefix + key, self._encode_(value), "PX", px)

    async def add ( self, key: str, value: Any, ttl: float | None = None ) -> bool:

        name(key)

        px    = self._px_(ttl)
        extra = ("PX", px, "NX") if px is not None else ("NX",)

        return await self._wire.send("SET", self.key(key), self._encode_(value), *extra) is not None

    async def delete ( self, key: str ) -> bool:

        if type(key) is not str: return False

        return bool(await self._wire.send("DEL", self.key(key)))

    async def take ( self, key: str ) -> Any:

        if type(key) is not str: return None

        return self._decode_(await self._wire.send("GETDEL", self._prefix + key))

    async def drop ( self, key: str, value: Any ) -> bool:

        if type(key) is not str: return False

        return bool(await self.run(DROP, self._prefix + key, self._encode_(value)))

    async def swap ( self, key: str, old: Any, new: Any, ttl: float | None = None ) -> bool:

        name(key)

        px = self._px_(ttl)

        return bool(await self.run(
            SWAP, self._prefix + key, self._encode_(old), self._encode_(new), "" if px is None else px,
        ))

    async def increment ( self, key: str, step: int = 1, ttl: float | None = None ) -> int:

        name(key)

        px = self._px_(ttl)

        if type(step) is not int: raise Fault(Code.INTERNAL, reason="cache.step")
        if px is None: return int(await self._wire.send("INCRBY", self._prefix + key, step))

        return int(await self.run(COUNT, self._prefix + key, step, px))

    async def bucket ( self, key: str, rate: float, burst: int, cost: int = 1 ) -> tuple[bool, float]:

        name(key)

        kept          = max(1000, int(burst / rate * 2000))
        allowed, left = await self.run(BUCKET, self._prefix + key, rate, burst, cost, kept)

        return bool(allowed), float(left)

    async def expire ( self, key: str, ttl: float ) -> bool:

        name(key)

        px = self._px_(ttl)

        if px is None: return False

        return bool(await self._wire.send("PEXPIRE", self.key(key), px))

    async def ttl ( self, key: str ) -> float | None:

        if type(key) is not str: return None

        left = int(await self._wire.send("PTTL", self.key(key)))

        return None if left < 0 else left / 1000

    async def set_many ( self, items: Mapping[str, Any], ttl: float | None = None ) -> None:

        px   = self._px_(ttl)
        tail: tuple[str | bytes | float, ...] = () if px is None else ("PX", px)

        for key in items: name(key)

        if not items: return

        await self._wire.many([("SET", self.key(key), self._encode_(value), *tail) for key, value in items.items()])

    async def keys ( self, prefix: str = "", limit: int = 1000 ) -> list[str]:

        found: list[str] = []
        width = len(self._prefix)

        async for held in self._scan_(self._glob_(prefix)):

            found.append(held[width:])

            if len(found) >= limit: break

        return sorted(found)

    async def clear ( self, prefix: str = "" ) -> int:

        names = [held async for held in self._scan_(self._glob_(prefix))]

        if not names: return 0

        return sum(int(count) for count in await self._wire.many([("DEL", name) for name in names]))

    async def ping ( self ) -> bool:

        try: return await self._wire.send("PING") in (b"PONG", "PONG")
        except Fault: return False

    async def close ( self ) -> None:

        await self._wire.close()

    async def _scan_ ( self, pattern: str ) -> AsyncIterator[str]:

        cursor = b"0"

        while True:

            cursor, names = await self._wire.send("SCAN", cursor, "MATCH", pattern, "COUNT", 500)

            for held in names: yield held.decode() if isinstance(held, bytes) else str(held)

            if cursor in (b"0", "0", 0): return

    async def run ( self, script: str, key: str, *parts: str | bytes | float ) -> Any:

        digest = self._digests.get(script)

        if digest is None:

            digest = self._digests[script] = crypto.hash(script, "sha1")

        try: return await self._wire.send("EVALSHA", digest, 1, key, *parts)
        except Fault as fault:

            if fault.reason != "cache.script": raise

        return await self._wire.send("EVAL", script, 1, key, *parts)

    def _decode_ ( self, raw: Any ) -> Any:

        if raw is None: return None
        if raw[:1] == RAW: return raw[1:]

        try: return json.decode(raw)
        except Fault: return raw.decode() if isinstance(raw, bytes) else raw

    @staticmethod
    def _encode_ ( value: Any ) -> bytes:

        return RAW + value if isinstance(value, bytes | bytearray) else json.encode(value)

    def _glob_ ( self, prefix: str ) -> str:

        return f"{self.key(prefix).translate(GLOB)}*"

    def _px_ ( self, ttl: float | None ) -> int | None:

        kept = life(ttl)

        return None if kept is None else max(1, int(kept * 1000))
