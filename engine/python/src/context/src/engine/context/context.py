from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from contextvars import ContextVar, Token
from typing import Any, cast
from types import MappingProxyType
from itertools import islice

from engine.error import Code, Fault
from .arch import EMPTY, FLAT, IDENTITY, MAPPINGS, NAME, Opened, Report, SHARED, WIDE, Work
from .deferral import Deferral
from .trace import Trace
import math

class Context:

    __slots__ = ("_deferral", "_facts")

    def __init__ ( self ) -> None:

        self._facts: ContextVar[Mapping[str, Any]] = ContextVar("engine.context", default=EMPTY)
        self._deferral: ContextVar[Deferral | None] = ContextVar("engine.deferral", default=None)

    def put ( self, **fields: Any ) -> Token[Mapping[str, Any]]:

        held = cast("MappingProxyType[str, Any]", self._facts.get())

        facts = MappingProxyType(held | fields if held else fields) if fields else held

        return self._facts.set(facts)

    def get ( self, name: str, default: Any = None ) -> Any:

        return self._facts.get().get(name, default)

    def has ( self, name: str ) -> bool:

        return name in self._facts.get()

    def need ( self, name: str ) -> Any:

        found = self._facts.get()

        if name not in found: raise Fault(Code.INTERNAL, reason=f"context.{name}")

        return found[name]

    def forget ( self, *names: str ) -> int:

        current = cast("MappingProxyType[str, Any]", self._facts.get())
        kept: dict[str, Any] | None = None

        for name in names:

            if name not in current: continue
            if kept is None: kept = current.copy()

            kept.pop(name, None)

        if kept is None: return 0

        self._facts.set(MappingProxyType(kept))

        return len(current) - len(kept)

    def clear ( self ) -> None:

        self._facts.set(EMPTY)
        self._deferral.set(None)

    def facts ( self ) -> Mapping[str, Any]:

        return self._facts.get()

    def snapshot ( self ) -> dict[str, Any]:

        return cast("MappingProxyType[str, Any]", self._facts.get()).copy()

    def dump ( self ) -> dict[str, Any]:

        return self._shared_(self._facts.get())

    def load ( self, facts: Mapping[str, Any] ) -> None:

        self._facts.set(MappingProxyType(self._shared_(facts)))

    def reset ( self, token: Token[Mapping[str, Any]] ) -> None:

        self._facts.reset(token)

    def open ( self, **fields: Any ) -> Opened:

        held = cast("MappingProxyType[str, Any]", self._facts.get())

        facts = MappingProxyType(held | fields if held else fields) if fields else held
        token = self._facts.set(facts)

        return token, self._deferral.set(Deferral())

    def close ( self, opened: Opened ) -> None:

        self._facts.reset(opened[0])
        self._deferral.reset(opened[1])

    def request_id ( self ) -> str | None:

        found = self._facts.get().get("request_id")

        return str(found) if found else None

    def headers ( self ) -> dict[str, str]:

        facts = self._facts.get()
        headers: dict[str, str] = {}
        identity = facts.get("request_id")
        parent = Trace.clean(facts.get("traceparent"))

        if (type(identity) is str and 0 < len(identity) <= IDENTITY
                and identity.isascii() and identity.replace("-", "").isalnum()):

            headers["X-Request-Id"] = identity

        if parent is not None: headers["traceparent"] = parent

        return headers

    def locale ( self, default: str = "en" ) -> str:

        return str(self._facts.get().get("locale") or default)

    def actor ( self ) -> Any:

        return self._facts.get().get("actor")

    @contextmanager
    def scope ( self, **fields: Any ) -> Iterator[Deferral]:

        token    = self.put(**fields)
        deferral = Deferral()
        inner    = self._deferral.set(deferral)

        try: yield deferral
        finally:

            self._deferral.reset(inner)
            self._facts.reset(token)

    def defer ( self, work: Work, always: bool = False ) -> bool:

        deferral = self._deferral.get()

        if deferral is None: return False

        deferral.add(work, always)

        return True

    def deferred ( self ) -> Deferral | None:

        return self._deferral.get()

    async def flush ( self, report: Report | None = None, failed: bool = False ) -> int:

        deferral = self._deferral.get()

        return await deferral.flush(report, failed) if deferral is not None else 0

    @staticmethod
    def _plain_ ( value: object ) -> bool:

        if isinstance(value, str): return len(value) <= WIDE
        if isinstance(value, int): return True

        return isinstance(value, float) and math.isfinite(value)

    @classmethod
    def _flat_ ( cls, value: Mapping[Any, Any] ) -> bool:

        if len(value) > FLAT: return False

        for name, item in value.items():

            if not isinstance(name, str) or len(name) > NAME or not cls._plain_(item): return False

        return True

    @classmethod
    def _shared_ ( cls, facts: Mapping[str, Any] ) -> dict[str, Any]:

        kept: dict[str, Any] = {}

        for key in SHARED:

            value = facts.get(key)

            if value is None: continue
            if cls._plain_(value): kept[key] = value
            elif isinstance(value, MAPPINGS) and len(value) <= FLAT:

                flat = value.copy() if type(value) is dict else dict(islice(value.items(), FLAT + 1))

                if cls._flat_(flat): kept[key] = flat

        return kept
