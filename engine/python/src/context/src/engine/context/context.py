from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from contextvars import ContextVar, Token
from typing import Any

from engine.error import Code, Fault
from .arch import EMPTY, FLAT, NAME, NUMBER, Opened, Report, SCALAR, SHARED, WIDE, Work
from .deferral import Deferral

class Context:

    def __init__ ( self ) -> None:

        self._facts: ContextVar[Mapping[str, Any]] = ContextVar("engine.context", default=EMPTY)
        self._deferral: ContextVar[Deferral | None] = ContextVar("engine.deferral", default=None)

    def put ( self, **fields: Any ) -> Token[Mapping[str, Any]]:

        held = self._facts.get()

        return self._facts.set({ **held, **fields } if held else fields)

    def get ( self, name: str, default: Any = None ) -> Any:

        return self._facts.get().get(name, default)

    def has ( self, name: str ) -> bool:

        return name in self._facts.get()

    def need ( self, name: str ) -> Any:

        found = self._facts.get()

        if name not in found: raise Fault(Code.INTERNAL, reason=f"context.{name}")

        return found[name]

    def forget ( self, *names: str ) -> int:

        current = self._facts.get()
        kept    = { key: value for key, value in current.items() if key not in names }

        self._facts.set(kept)

        return len(current) - len(kept)

    def clear ( self ) -> None:

        self._facts.set(EMPTY)
        self._deferral.set(None)

    def facts ( self ) -> Mapping[str, Any]:

        return self._facts.get()

    def snapshot ( self ) -> dict[str, Any]:

        return dict(self._facts.get())

    def dump ( self ) -> dict[str, Any]:

        return { key: value for key, value in self._facts.get().items() if key in SHARED }

    def load ( self, facts: Mapping[str, Any] ) -> None:

        kept: dict[str, Any] = {}

        for key in SHARED:

            value = facts.get(key)

            if isinstance(value, SCALAR):

                if self._plain_(value): kept[key] = value

            elif isinstance(value, Mapping) and self._flat_(value): kept[key] = dict(value)

        self._facts.set(kept)

    def reset ( self, token: Token[Mapping[str, Any]] ) -> None:

        self._facts.reset(token)

    def open ( self, **fields: Any ) -> Opened:

        held = self._facts.get()

        return self._facts.set({ **held, **fields } if held else fields), self._deferral.set(Deferral())

    def close ( self, opened: Opened ) -> None:

        self._facts.reset(opened[0])
        self._deferral.reset(opened[1])

    def request_id ( self ) -> str | None:

        found = self._facts.get().get("request_id")

        return str(found) if found else None

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

        return len(value) <= WIDE if isinstance(value, str) else isinstance(value, NUMBER)

    @classmethod
    def _flat_ ( cls, value: Mapping[Any, Any] ) -> bool:

        if len(value) > FLAT: return False

        for name, item in value.items():

            if not isinstance(name, str) or len(name) > NAME or not cls._plain_(item): return False

        return True
