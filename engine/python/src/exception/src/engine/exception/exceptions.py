from collections.abc import Callable, Mapping
from contextlib import suppress
from typing import Any, cast

from engine.error import Code, Fault
from engine.log import log
from .arch import Context, DEFAULTS, FIELDS, Factory, KEYS, LEVELS, MARK, RESERVED, Reporter, TRACED, WORD
import inspect, sys, time

class Exceptions:

    def __init__ ( self ) -> None:

        self._maps: dict[type[BaseException], Factory] = {}
        self._ignored: tuple[type[BaseException], ...] = ()
        self._levels: dict[Code, str] = {}
        self._reporters: list[Reporter] = []
        self._contexts: list[Context] = []
        self._recent: dict[tuple[str, str, str], tuple[float, int]] = {}
        self._counts: dict[str, int] = {}
        self._burst  = 0
        self._window = 0.0
        self._seen   = 0
        self._sent   = 0
        self._muted  = 0

        self.clear()

    def map (
        self, kind: type[BaseException], to: Code | Factory, reason: str | None = None, unknown: bool = False,
    ) -> None:

        named = reason is None or (type(reason) is str and 0 < len(reason) <= WORD)

        if not self._raised_(kind) or not named or not (isinstance(to, Code) or self._plain_(to)):

            raise Fault(Code.INTERNAL, reason="exception.map")

        if not isinstance(to, Code):

            self._maps[kind] = to
            return

        code, why = to, reason or kind.__name__.lower()

        def made ( _: BaseException ) -> Fault:

            return Fault(code, reason=why, unknown=unknown)

        self._maps[kind] = made

    def ignore ( self, *kinds: type[BaseException] ) -> None:

        if not all(self._raised_(kind) for kind in kinds): raise Fault(Code.INTERNAL, reason="exception.ignore")

        self._ignored = tuple(dict.fromkeys((*self._ignored, *kinds)))

    def level ( self, code: Code, level: str ) -> None:

        if type(code) is not Code or type(level) is not str or level not in LEVELS:

            asked = level[:WORD] if type(level) is str else type(level).__name__

            raise Fault(Code.INTERNAL, reason="exception.level", errors={ "level": [asked] })

        self._levels[code] = level

    def report ( self, reporter: Reporter ) -> None:

        if not self._plain_(reporter): raise Fault(Code.INTERNAL, reason="exception.report")
        if reporter not in self._reporters: self._reporters.append(reporter)

    def context ( self, provider: Context ) -> None:

        if not self._plain_(provider): raise Fault(Code.INTERNAL, reason="exception.context")
        if provider not in self._contexts: self._contexts.append(provider)

    def throttle ( self, burst: int, window: float ) -> None:

        sound = type(burst) is int and burst >= 0 and type(window) in (int, float) and 0 <= window <= sys.float_info.max

        if not sound: raise Fault(Code.INTERNAL, reason="exception.throttle")

        self._burst  = burst
        self._window = float(window)
        self._recent = {}

    def fault ( self, error: BaseException ) -> Fault:

        if isinstance(error, Fault): return error

        for kind in type(error).__mro__:

            factory = self._maps.get(kind)

            if factory is not None: return self._made_(factory, error)

        return Fault.wrap(error)

    def handle ( self, error: BaseException ) -> Fault:

        fault = self.fault(error)

        self._seen += 1
        self._counts[fault.code.value] = self._counts.get(fault.code.value, 0) + 1

        if self._reported_(error, fault) or isinstance(error, self._ignored): return fault

        level = self._levels.get(fault.code) or self._level_(fault)

        if not self._reporters and not log.enabled(level): return fault

        if self._throttled_(fault, error):

            self._muted += 1
            return fault

        traced = level in TRACED and fault.server()
        fields = self._fields_(fault, error)

        log.at(level, "exception" if fault.server() else "fault", exc_info=error if traced else None, **fields)

        self._sent += 1

        for reporter in tuple(self._reporters):

            try: self._spent_(reporter(fault, error))
            except Exception as failed: log.warning("exception.reporter", kind=type(failed).__name__)

        return fault

    def safe [T] ( self, fallback: T, work: Callable[[], T] ) -> T:

        try: return work()
        except Exception as error:

            self.handle(error)

            return fallback

    def stats ( self ) -> dict[str, Any]:

        return { "seen": self._seen, "reported": self._sent, "muted": self._muted, "codes": dict(self._counts) }

    def clear ( self ) -> None:

        self._maps      = {}
        self._ignored   = ()
        self._levels    = {}
        self._reporters = []
        self._contexts  = []
        self._recent    = {}
        self._counts    = {}
        self._burst     = 0
        self._window    = 0.0
        self._seen      = 0
        self._sent      = 0
        self._muted     = 0

        for kind, code, reason, unknown in DEFAULTS: self.map(kind, code, reason, unknown)

    def describe ( self ) -> dict[str, Any]:

        return {
            "maps"      : sorted(kind.__name__ for kind in self._maps),
            "ignored"   : sorted(kind.__name__ for kind in self._ignored),
            "levels"    : { code.value: level for code, level in sorted(self._levels.items()) },
            "reporters" : len(self._reporters),
            "contexts"  : len(self._contexts),
            "throttle"  : { "burst": self._burst, "window": self._window },
            **self.stats(),
        }

    def _raised_ ( self, kind: object ) -> bool:

        return isinstance(kind, type) and issubclass(kind, BaseException)

    def _plain_ ( self, work: object ) -> bool:

        return callable(work) and not inspect.iscoroutinefunction(work)

    def _spent_ ( self, value: object ) -> None:

        if inspect.iscoroutine(value): value.close()

    def _made_ ( self, factory: Factory, error: BaseException ) -> Fault:

        try: made = cast("object", factory(error))
        except Exception as failed:

            log.warning("exception.factory", kind=type(failed).__name__)

            return Fault.wrap(error)

        if not isinstance(made, Fault):

            self._spent_(made)
            log.warning("exception.factory", kind=type(made).__name__)

            return Fault.wrap(error)

        if made.__cause__ is None and made is not error.__cause__ and made is not error.__context__:

            made.__cause__ = error

        return made

    def _fields_ ( self, fault: Fault, error: BaseException ) -> dict[str, Any]:

        fields: dict[str, Any] = {
            "code": fault.code.value, "reason": fault.reason, "kind": type(error).__name__, "status": int(fault.status),
        }

        for provider in tuple(self._contexts):

            for name, value in self._found_(provider).items():

                if type(name) is not str or name in RESERVED: continue
                if name in fields or len(fields) < FIELDS: fields[name] = value

        return fields

    def _found_ ( self, provider: Context ) -> dict[Any, Any]:

        found: object = None

        try:

            found = cast("object", provider())

            if isinstance(found, Mapping): return dict(found)

        except Exception as failed: found = failed

        self._spent_(found)
        log.warning("exception.context", kind=type(found).__name__)

        return {}

    def _level_ ( self, fault: Fault ) -> str:

        if not fault.server(): return "debug"

        return "warning" if fault.retryable() else "error"

    def _reported_ ( self, error: BaseException, fault: Fault ) -> bool:

        if getattr(error, MARK, False) or getattr(fault, MARK, False): return True

        for marked in (error, fault):

            with suppress(AttributeError, TypeError): setattr(marked, MARK, True)

        return False

    def _throttled_ ( self, fault: Fault, error: BaseException ) -> bool:

        if self._burst == 0: return False

        key    = (fault.code.value, fault.reason or "", type(error).__name__)
        now    = time.monotonic()
        opened, count = self._recent.get(key, (now, 0))

        if now - opened >= self._window: opened, count = now, 0

        if len(self._recent) >= KEYS and key not in self._recent: self._recent = {}

        self._recent[key] = (opened, count + 1)

        return count >= self._burst
