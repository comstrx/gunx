# Python

How Python is written here, in `engine/python` and in every Python `api`. The hand style is the format: no `black`, no `ruff format`; ruff `ALL` and mypy strict check rules, the hand writes the shape, the reviewer reads it.

## Toolchain

- Current CPython, the newest stable on the day of the task; uv for everything (workspace, lock, run, build); hatchling builds.
- ruff with `ALL` on and a short, reasoned ignore list in `pyproject.toml` (never `noqa` in a source); mypy strict at zero, with the pydantic plugin; pytest with random order, warnings as errors, a per-test time limit.
- Async-only I/O; CPU work through the engine's `thread.offload`; nothing blocks the loop. Native cores (C, Rust, Zig, C++) through one wrapping file each, chosen by measurement.

## Hand style

```python
from engine.error import Code, Fault
from engine.log import log
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

- Definition sites spaced (`def get ( self, key: str ) -> str:`); calls, literals and subscripts tight; a short branch is a one-liner; one blank line after every `def`/`class` header whose body sits on its own lines (a law test enforces it); the body breathes before it closes.
- A long signature puts parameters on 8-space continuation lines and `) -> T:` on its own line; constants upper case; `type X = …` aliases; 3.12+ generics (`def f [T] ( … )`).
- A class is the namespace; a package's `__init__.py` imports, then aligned lowercase singletons, then `__all__`; constructors do no I/O.
- Dataclasses `frozen=True, slots=True`; protocols for ports; `StrEnum` for closed vocabularies; `TaskGroup`, bounded fan-out, `asyncio.timeout`.
- Imports: third-party and engine first, then the part's own, then one combined standard library line (`import asyncio, time`); no wildcard; no `import x as y` to dodge a lint; `from __future__` never needed.
- Strings double-quoted; f-strings over concatenation; a long message lives in a variable, not inline in a raise. Columns 120.
- Errors: no bare `except`, no swallowed exception, no `print` outside command entry points; the engine raises only `Fault`; a layer above raises the engine's fault with its own reason.
- Typing: every public parameter and return annotated; no implicit `Optional`; `Any` only at a declared boundary with a cast on the way in; `DateTime TimeDelta UTC Uuid Path Decimal JsonValue` come from the engine for every layer above.
- Files: flat folders of 100–300 lines; a smaller module merges into its sibling, a larger one sheds a concern; `py.typed` in every package.

## Tests and benches

- Flat `tests/test_<domain>.py` on the engine's stage (`engine.test`), real services only, exact values, the failure path read as a `Fault` with its reason, never a `try`/`fail` pair; `conftest.py` provisions once per session.
- Flat `benches/bench_<name>.py` on `engine.test.Bench`: warm, sample, print p50/p95/p99; nothing judges a number.
- Flat `fuzz/fuzz_<domain>.py`: hypothesis (`@given` over binary and structured strategies, `max_examples` in the tens of thousands, no deadline, no database) run as a script, printing the example count; a parser or decoder gets a target the day it lands.
- Audit: pip-audit over the frozen export of the lock, strict; Dependabot keeps the pins fresh.
- Laws are tests: the manifest law, the shape law, the vocabulary law, the import direction of a service. No test scans syntax, format or style beyond the blank-line law.

## Direction

The fastest Python possible: native cores behind the same signatures, measured on a stated machine; Laravel's ease with mypy's strictness. Everything proven here is the Rust engine's next lap.
