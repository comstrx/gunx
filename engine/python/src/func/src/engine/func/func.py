from collections.abc import Awaitable, Callable, Hashable, Sequence
from functools import partial, wraps
from importlib import import_module
from types import FunctionType
from typing import Any, cast, get_type_hints
from weakref import WeakKeyDictionary

from engine.error import Code, Fault
from engine.log import log
from engine.rand import rand
from engine.thread import thread
from .arch import (
    BACKOFF, CEILING, Core, DEPTH, DOUBLES, Flush, Handler, Info, Keyed, LONG, LOOSE, MISSING, MODES, ORDERED, PART,
    PATH, PLAIN, SWITCH, TAGGED, Target, TRIES, Work,
)
from .batch import Batch
from .breaker import Breaker
from .limiter import Limiter
from .memo import Memo
import asyncio, inspect, math, os, sys, time

class Func:

    def __init__ ( self ) -> None:

        self._cores: dict[str, Core] = {}
        self._forced: str | None = None
        self._pending: set[asyncio.Task[Any]] = set()
        self._signs: WeakKeyDictionary[Target, inspect.Signature] = WeakKeyDictionary()
        self._hints: WeakKeyDictionary[Target, dict[str, Any]] = WeakKeyDictionary()

    def setup ( self, mode: str | None = None ) -> None:

        wanted = (mode or os.environ.get(SWITCH, "auto")).strip().lower()

        if wanted not in MODES: raise Fault(Code.INTERNAL, reason="func.mode")

        self._forced = None if wanted == "auto" else wanted
        self._cores  = {}

    def mode ( self ) -> str:

        return self._forced or "auto"

    def has ( self, module: str ) -> bool:

        try: import_module(module)
        except ImportError: return False

        return True

    def pick [T] ( self, name: str, module: str, native: Callable[[], T], pure: Callable[[], T] ) -> T:

        core = self._cores.get(name)

        if core is None:

            chosen = self._choose_(module)
            core   = Core(name, module, native, pure, chosen)

            self._cores[name] = core

            if chosen == "pure" and self._forced is None: log.debug("func.pure", core=name, module=module)

        return native() if core.chosen == "native" else pure()

    def names ( self ) -> tuple[str, ...]:

        return tuple(sorted(self._cores))

    def describe ( self ) -> dict[str, str]:

        return { name: core.chosen for name, core in sorted(self._cores.items()) }

    def clear ( self ) -> int:

        count, self._cores = len(self._cores), {}

        return count

    def unwrap ( self, target: Target ) -> Target:

        found = target

        for _ in range(DEPTH):

            inner = found.func if isinstance(found, partial) else getattr(found, "__wrapped__", None)

            if inner is None: return found

            found = inner

        raise Fault(Code.INTERNAL, reason="func.unwrap")

    def name ( self, target: Target ) -> str:

        found = self.unwrap(target)

        return str(getattr(found, "__qualname__", None) or getattr(found, "__name__", None) or type(found).__name__)

    def module ( self, target: Target ) -> str:

        return str(getattr(self.unwrap(target), "__module__", None) or "")

    def doc ( self, target: Target ) -> str:

        return inspect.getdoc(self.unwrap(target)) or ""

    def file ( self, target: Target ) -> str | None:

        found = self.unwrap(target)
        code  = getattr(found, "__code__", None)

        if code is not None: return str(code.co_filename)

        return getattr(sys.modules.get(self.module(found)), "__file__", None)

    def line ( self, target: Target ) -> int | None:

        code = getattr(self.unwrap(target), "__code__", None)

        return int(code.co_firstlineno) if code is not None else None

    async def source ( self, target: Target ) -> str:

        try: return await thread.offload(inspect.getsource, self.unwrap(target))
        except (OSError, TypeError) as error: raise Fault(Code.NOT_FOUND, reason="func.source") from error

    def signature ( self, target: Target ) -> inspect.Signature:

        plain = type(target) is FunctionType
        found = self._signs.get(target) if plain else None

        if found is None:

            try: found = inspect.signature(target)
            except (TypeError, ValueError) as error: raise Fault(Code.INTERNAL, reason="func.signature") from error

            if plain: self._signs[target] = found

        return found

    def params ( self, target: Target ) -> tuple[str, ...]:

        return tuple(self.signature(target).parameters)

    def required ( self, target: Target ) -> tuple[str, ...]:

        spread = (inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD)

        return tuple(
            name for name, found in self.signature(target).parameters.items()
            if found.default is inspect.Parameter.empty and found.kind not in spread
        )

    def defaults ( self, target: Target ) -> dict[str, Any]:

        return {
            name: found.default for name, found in self.signature(target).parameters.items()
            if found.default is not inspect.Parameter.empty
        }

    def hints ( self, target: Target ) -> dict[str, Any]:

        inner = self.unwrap(target)
        plain = type(inner) is FunctionType
        found = self._hints.get(inner) if plain else None

        if found is None:

            try: found = get_type_hints(inner)
            except (NameError, TypeError, SyntaxError, AttributeError) as error:

                raise Fault(Code.INTERNAL, reason="func.hints") from error

            if plain: self._hints[inner] = found

        return dict(found)

    def returns ( self, target: Target ) -> Any:

        return self.hints(target).get("return")

    def arity ( self, target: Target ) -> int:

        placed = (inspect.Parameter.POSITIONAL_ONLY, inspect.Parameter.POSITIONAL_OR_KEYWORD)

        return sum(1 for found in self.signature(target).parameters.values() if found.kind in placed)

    def bind ( self, target: Target, *args: Any, **kwargs: Any ) -> dict[str, Any]:

        try: bound = self.signature(target).bind(*args, **kwargs)
        except TypeError as error:

            raise Fault(Code.VALIDATION, reason="func.bind", errors={ "arguments": [str(error)] }) from error

        bound.apply_defaults()

        return dict(bound.arguments)

    def accepts ( self, target: Target, *args: Any, **kwargs: Any ) -> bool:

        try: self.signature(target).bind(*args, **kwargs)
        except TypeError: return False

        return True

    def info ( self, target: Target ) -> Info:

        return Info(
            self.name(target), self.module(target), self.file(target), self.line(target), self.doc(target),
            self.params(target), self.required(target), self.defaults(target), self.returns(target),
            self.arity(target), self.is_async(target), self.is_generator(target),
        )

    def resolve ( self, path: str, roots: Sequence[str] = () ) -> Any:

        if type(path) is not str or len(path) > LONG: raise Fault(Code.INTERNAL, reason="func.resolve")

        module, _, attribute = path.partition(":")
        parts  = (*module.split("."), *attribute.split("."))
        inside = not roots or any(module == root or module.startswith(f"{root}.") for root in roots)

        if not attribute or not inside or not all(PART.fullmatch(part) for part in parts):

            raise Fault(Code.INTERNAL, reason="func.resolve", errors={ "path": [path[:PATH]] })

        try: found: Any = import_module(module)
        except ImportError as error:

            raise Fault(Code.NOT_FOUND, reason="func.resolve", errors={ "path": [path[:PATH]] }) from error

        for part in attribute.split("."):

            found = getattr(found, part, MISSING)

            if found is MISSING: raise Fault(Code.NOT_FOUND, reason="func.resolve", errors={ "path": [path[:PATH]] })

        return found

    def is_async ( self, target: Any ) -> bool:

        if inspect.iscoroutinefunction(target): return True

        return callable(target) and inspect.iscoroutinefunction(type(target).__call__)

    def is_generator ( self, target: Any ) -> bool:

        return inspect.isgeneratorfunction(target) or inspect.isasyncgenfunction(target)

    def is_lambda ( self, target: Any ) -> bool:

        return getattr(target, "__name__", "") == "<lambda>"

    def is_partial ( self, target: Any ) -> bool:

        return isinstance(target, partial)

    def is_method ( self, target: Any ) -> bool:

        return inspect.ismethod(target)

    async def call ( self, target: Target, *args: Any, **kwargs: Any ) -> Any:

        found = target(*args, **kwargs)

        return await found if inspect.isawaitable(found) else found

    def lift ( self, target: Target ) -> Handler:

        if self.is_async(target): return cast("Handler", target)

        @wraps(target)
        async def lifted ( *args: Any, **kwargs: Any ) -> Any:

            found = target(*args, **kwargs)

            return await found if inspect.isawaitable(found) else found

        return lifted

    def hook (
        self, handler: Handler, before: Target | None = None, after: Target | None = None,
        failed: Target | None = None,
    ) -> Handler:

        call = self.call

        @wraps(handler)
        async def hooked ( *args: Any, **kwargs: Any ) -> Any:

            if before is not None: await call(before, *args, **kwargs)

            try: found = await handler(*args, **kwargs)
            except Exception as error:

                if failed is not None: await call(failed, error)

                raise

            if after is not None: await call(after, found)

            return found

        return hooked

    def key ( self, *args: Any, **kwargs: Any ) -> Hashable:

        if not kwargs and PLAIN.issuperset(map(type, args)): return args

        try:

            found = (self._frozen_(args, 0), self._frozen_(kwargs, 0)) if kwargs else self._frozen_(args, 0)

            hash(found)

        except TypeError as error: raise Fault(Code.INTERNAL, reason="func.key") from error

        return found

    def cached (
        self, ttl: float = 60.0, size: int = 1024, key: Keyed | None = None, memo: Memo | None = None,
    ) -> Callable[[Handler], Handler]:

        named = key or self.key

        def decorator ( handler: Handler ) -> Handler:

            kept = memo if memo is not None else Memo(ttl, size)

            @wraps(handler)
            async def cached ( *args: Any, **kwargs: Any ) -> Any:

                return await kept.remember(named(*args, **kwargs), lambda: handler(*args, **kwargs))

            return cached

        return decorator

    def single ( self, handler: Handler, key: Keyed | None = None ) -> Handler:

        named   = key or self.key
        flights : dict[Hashable, asyncio.Task[Any]] = {}

        @wraps(handler)
        async def shared ( *args: Any, **kwargs: Any ) -> Any:

            mark   = named(*args, **kwargs)
            flight = flights.get(mark)

            if flight is None:

                def landed ( done: asyncio.Task[Any] ) -> None:

                    flights.pop(mark, None)

                    if not done.cancelled(): done.exception()

                flight = flights[mark] = asyncio.get_running_loop().create_task(handler(*args, **kwargs))

                flight.add_done_callback(landed)
                self._track_(flight)

            return await asyncio.shield(flight)

        return shared

    async def retry [T] (
        self, work: Work[T], tries: int = TRIES, backoff: float = BACKOFF, ceiling: float = CEILING,
        jitter: bool = True, idempotent: bool = False,
    ) -> T:

        if tries < 1 or not 0 <= backoff < math.inf or not 0 <= ceiling < math.inf:

            raise Fault(Code.INTERNAL, reason="func.retry")

        attempt = 0

        while True:

            attempt += 1

            try: return await work()
            except Fault as fault:

                asked = fault.retry_after or 0.0

                if attempt >= tries or asked > ceiling or not fault.safe(idempotent): raise

                wait = min(ceiling, math.ldexp(backoff, min(attempt - 1, DOUBLES)))

                if jitter: wait = wait * (0.5 + rand.number() / 2)

                wait = max(wait, asked)

                log.debug("retry", attempt=attempt, wait=round(wait, 3), reason=fault.reason)

                await asyncio.sleep(wait)

    async def timeout [T] ( self, seconds: float, work: Work[T], reason: str = "timeout" ) -> T:

        if not seconds < math.inf: raise Fault(Code.INTERNAL, reason="func.timeout")

        try:

            async with asyncio.timeout(seconds): return await work()

        except TimeoutError as error: raise Fault(Code.TIMEOUT, reason=reason, unknown=True) from error

    async def hedge [T] ( self, work: Work[T], delay: float, copies: int = 2 ) -> T:

        if copies < 1 or not 0 <= delay < math.inf: raise Fault(Code.INTERNAL, reason="func.hedge")

        flying  : set[asyncio.Future[T]] = set()
        started = 0
        last    : Fault | None = None

        try:

            while flying or started < copies:

                if started < copies:

                    flying.add(asyncio.ensure_future(work()))

                    started += 1

                done, flying = await asyncio.wait(
                    flying, timeout=delay if started < copies else None, return_when=asyncio.FIRST_COMPLETED,
                )
                errors = { landed: landed.exception() for landed in done }
                won    = next((landed for landed, error in errors.items() if error is None), None)
                odd    = next((error for error in errors.values() if error and not isinstance(error, Fault)), None)

                if won is not None: return won.result()
                if odd is not None: raise odd

                last = next((error for error in errors.values() if isinstance(error, Fault)), last)

            raise cast("Fault", last)

        finally:

            for left in flying: left.cancel()

            if flying: await asyncio.gather(*flying, return_exceptions=True)

    def once [T] ( self, work: Work[T] ) -> Work[T]:

        holder: list[T] = []
        lock = asyncio.Lock()

        async def run () -> T:

            if holder: return holder[0]

            async with lock:

                if not holder: holder.append(await work())

            return holder[0]

        return run

    def memo ( self, ttl: float = 60.0, size: int = 1024 ) -> Memo:

        return Memo(ttl, size)

    def breaker ( self, name: str, threshold: int = 5, cooldown: float = 30.0 ) -> Breaker:

        return Breaker(name, threshold, cooldown)

    def limiter ( self, rate: float, burst: int ) -> Limiter:

        return Limiter(rate, burst)

    def batch [T, R] ( self, flush: Flush[T, R], size: int = 64, delay: float = 0.0 ) -> Batch[T, R]:

        return Batch(flush, size, delay)

    async def settle [T] ( self, works: list[Work[T]] ) -> list[T | Fault]:

        results: list[T | Fault] = []

        for work in works:

            try: results.append(await work())
            except Fault as fault: results.append(fault)

        return results

    def pipe [T] ( self, value: T, *steps: Callable[[T], T] ) -> T:

        for step in steps: value = step(value)

        return value

    def compose ( self, *steps: Callable[[Any], Any] ) -> Callable[[Any], Any]:

        def composed ( value: Any ) -> Any:

            return self.pipe(value, *steps)

        return composed

    def tap [T] ( self, value: T, step: Callable[[T], Any] ) -> T:

        step(value)

        return value

    def when [T] ( self, condition: bool, value: T, step: Callable[[T], T] ) -> T:

        return step(value) if condition else value

    def unless [T] ( self, condition: bool, value: T, step: Callable[[T], T] ) -> T:

        return value if condition else step(value)

    async def attempt [T] ( self, work: Work[T], default: T | None = None ) -> T | None:

        try: return await work()
        except Fault as fault:

            log.debug("attempt.failed", reason=fault.reason)

            return default

    async def measure [T] ( self, work: Work[T] ) -> tuple[T, float]:

        started = time.perf_counter()
        result  = await work()

        return result, round((time.perf_counter() - started) * 1000, 3)

    async def fallback [T] ( self, *works: Work[T] ) -> T:

        if not works: raise Fault(Code.INTERNAL, reason="func.fallback")

        last: Fault | None = None

        for work in works:

            try: return await work()
            except Fault as fault: last = fault

        raise cast("Fault", last)

    async def poll (
        self, check: Callable[[], Awaitable[bool] | bool], every: float = 0.1, timeout: float = 10.0,
        reason: str = "poll",
    ) -> None:

        if not 0 <= every < math.inf or not 0 <= timeout < math.inf: raise Fault(Code.INTERNAL, reason="func.poll")

        deadline = time.monotonic() + timeout

        while True:

            found = check()
            ready = await found if isinstance(found, Awaitable) else found

            if ready: return
            if time.monotonic() >= deadline: raise Fault(Code.TIMEOUT, reason=reason, unknown=True)

            await asyncio.sleep(every)

    def debounce ( self, seconds: float ) -> Callable[[Handler], Callable[..., Awaitable[None]]]:

        if not 0 <= seconds < math.inf: raise Fault(Code.INTERNAL, reason="func.debounce")

        def decorator ( handler: Handler ) -> Callable[..., Awaitable[None]]:

            timers: list[asyncio.TimerHandle] = []

            async def wrapper ( *args: Any, **kwargs: Any ) -> None:

                loop = asyncio.get_running_loop()

                for timer in timers: timer.cancel()

                timers.clear()

                def fire () -> None:

                    timers.clear()

                    fired = loop.create_task(handler(*args, **kwargs))

                    fired.add_done_callback(self._reaped_)
                    self._track_(fired)

                timers.append(loop.call_later(seconds, fire))

            return wrapper

        return decorator

    def throttle ( self, seconds: float ) -> Callable[[Handler], Callable[..., Awaitable[Any]]]:

        if not 0 <= seconds < math.inf: raise Fault(Code.INTERNAL, reason="func.throttle")

        def decorator ( handler: Handler ) -> Callable[..., Awaitable[Any]]:

            last = [float("-inf")]

            async def wrapper ( *args: Any, **kwargs: Any ) -> Any:

                now = time.monotonic()

                if now - last[0] < seconds: return None

                last[0] = now

                return await handler(*args, **kwargs)

            return wrapper

        return decorator

    def pending ( self ) -> int:

        return len(self._pending)

    async def drain ( self ) -> int:

        count = 0

        while self._pending:

            flying = tuple(self._pending)
            count += len(flying)

            await asyncio.wait(flying)

        return count

    def _track_ ( self, task: asyncio.Task[Any] ) -> None:

        self._pending.add(task)
        task.add_done_callback(self._pending.discard)

    def _reaped_ ( self, task: asyncio.Task[Any] ) -> None:

        error = None if task.cancelled() else task.exception()

        if error is not None: log.error("func.task", task=task.get_name(), kind=type(error).__name__)

    def _choose_ ( self, module: str ) -> str:

        if self._forced == "pure": return "pure"
        if self.has(module): return "native"
        if self._forced == "native": raise Fault(Code.INTERNAL, reason="func.native", message=f"{module} is required")

        return "pure"

    def _frozen_ ( self, value: Any, depth: int ) -> Hashable:

        kind = type(value)

        if kind in PLAIN: return cast("Hashable", value)
        if isinstance(value, TAGGED): return (kind, value)
        if depth >= DEPTH: raise Fault(Code.INTERNAL, reason="func.key", errors={ "depth": [str(DEPTH)] })
        if kind in ORDERED: return (kind, tuple(self._frozen_(item, depth + 1) for item in value))
        if kind in LOOSE: return (kind, frozenset(self._frozen_(item, depth + 1) for item in value))
        if kind is dict:

            return (kind, frozenset(
                (self._frozen_(name, depth + 1), self._frozen_(item, depth + 1)) for name, item in value.items()
            ))

        raise Fault(Code.INTERNAL, reason="func.key", errors={ "type": [kind.__name__[:PATH]] })
