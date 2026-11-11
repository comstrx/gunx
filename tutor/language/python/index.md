# Python

How Python is written here, in the engine and in every Python api. The hand style is the format: no `black`, no `ruff format`; ruff `ALL` and mypy strict check rules, the hand writes the shape, the reviewer reads it.

## Toolchain

- Current CPython; uv for everything (workspace, lock, run, build); hatchling builds.
- ruff with `ALL` on and a short, reasoned ignore list in the manifest (never `noqa` in a source); mypy strict at zero; pytest with random order, warnings as errors and a per-test time limit; hypothesis for fuzz targets; pip-audit over the frozen export.
- Async-only I/O; CPU work offloaded to a thread; nothing blocks the loop. Native cores (C, Rust, Zig, C++) through one wrapping file each, chosen by measurement, the pure path kept as the reference.

## Hand style

```python
from msgspec import Struct

from .error import Code, Fault
from .log import log
import asyncio, time

LIMIT = 512

@dataclass(frozen=True, slots=True)
class Hit:

    allowed   : bool
    remaining : int

class Cache:

    def __init__ ( self, store: Store ) -> None:

        self._store = store
        self._lock  = asyncio.Lock()

    async def remember [T] ( self, key: str, ttl: float, loader: Loader[T] ) -> T:

        found = await self._store.get(key)

        if found is not None: return cast("T", found)

        value = await loader()

        await self._store.set(key, value, ttl)

        return value
```

- Definition sites spaced (`def get ( self, key: str ) -> str:`); calls, literals and subscripts tight; a short branch is a one-liner; one blank line after every `def`/`class` header whose body sits on its own lines (a law test enforces it); a stub whose body sits on the header line stays inline. Columns 120.
- A long signature puts parameters on 8-space continuation lines and `) -> T:` on its own line; constants upper case; `type X = …` aliases; 3.12+ generics (`def f [T] ( … )`).
- A class is the namespace; a package's `__init__.py` imports, then aligned lowercase singletons, then `__all__`; constructors do no I/O.
- Dataclasses `frozen=True, slots=True`; protocols for ports; `StrEnum` for closed vocabularies; `TaskGroup`, bounded fan-out, `asyncio.timeout`.
- Imports end with one combined standard library line (`import asyncio, time`); `from __future__` never needed.
- Strings double-quoted; f-strings over concatenation; a long message lives in a variable, not inline in a raise.
- Errors: no bare `except`; a layer above the engine raises the engine's fault with its own reason.
- Typing: no implicit `Optional`; `Any` only at a declared boundary with a cast on the way in; the unified types (`DateTime TimeDelta UTC Uuid Path Decimal JsonValue`) come from the engine for every layer above it; `py.typed` in every package.

## Tests and benches

- Flat `tests/test_<domain>.py` on a real stage (real database, cache and broker), exact values, the failure path read as a fault with its reason, never a `try`/`fail` pair; `conftest.py` provisions once per session.
- Flat `benches/bench_<name>.py`: warm, sample, print p50/p95/p99.
- Flat `fuzz/fuzz_<domain>.py`: `@given` over binary and structured strategies, `max_examples` in the tens of thousands, no deadline, no database, run as a script printing the example count; a parser or decoder gets a target the day it lands.
- Laws are tests: the manifest law, the shape law, the vocabulary law, the import direction of a service. No test scans syntax, format or style beyond the blank-line law.
