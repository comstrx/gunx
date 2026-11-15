from collections.abc import Awaitable
from typing import ClassVar

from engine.error import Code, Fault
from engine.rand import rand
from .arch import EMPTY, IDENT, Receipt, WORD

class Adapter:

    __slots__ = ()

    family       : ClassVar[str] = ""
    name         : ClassVar[str] = ""
    capabilities : ClassVar[frozenset[str]] = frozenset()

    def can ( self, capability: str ) -> bool:

        held: object = capability

        if not isinstance(held, str): return False

        try: return held in self.capabilities
        except TypeError: return False

    def ensure ( self, capability: str ) -> None:

        if self.can(capability): return

        asked   = capability[:WORD] if type(capability) is str else type(capability).__name__
        message = f"{self.name} cannot {asked}"

        raise Fault(Code.INTERNAL, message, f"{self.family}.capability", { "capability": [asked] })

    def need ( self, **settings: object ) -> None:

        missing = [name for name, value in settings.items() if self._blank_(value)]

        if not missing: return

        message = f"{self.name} needs {', '.join(missing)}"

        raise Fault(Code.INTERNAL, message, f"{self.family}.settings", { "missing": missing })

    async def ready ( self ) -> bool:

        return True

    async def upstream [T] ( self, work: Awaitable[T] ) -> T:

        try: return await work
        except Fault as fault:

            if fault.reason == "json.decode": raise self._malformed_() from fault
            if not fault.client(): raise

            errors = { "provider": [fault.reason or fault.code.value] }

            code = Code.UNAVAILABLE if fault.retryable() else Code.INTERNAL

            raise Fault(
                code, reason=f"{self.family}.provider", errors=errors,
                retry_after=fault.retry_after, unknown=fault.unknown,
            ) from fault

    def receipt ( self, body: object, status: str = "sent" ) -> Receipt:

        if body is not None and not isinstance(body, dict): raise self._malformed_()

        held: dict[str, object] = body or {}
        key  = held.get("id")
        word = held.get("status", status)

        if type(word) is not str or not word.isascii() or not 0 < len(word) <= WORD: raise self._malformed_()

        word = word.strip()

        if not word or not word.isprintable(): raise self._malformed_()
        if key is not None and not self._keyed_(key): raise self._malformed_()

        return Receipt(key if isinstance(key, str) else rand.hex(6), word.lower(), held)

    @staticmethod
    def _keyed_ ( key: object ) -> bool:

        return type(key) is str and 0 < len(key) <= IDENT and key.isprintable() and bool(key.strip())

    def _malformed_ ( self ) -> Fault:

        return Fault(Code.UNAVAILABLE, reason=f"{self.family}.reply", unknown=True)

    async def close ( self ) -> None:

        return None

    def describe ( self ) -> dict[str, object]:

        return { "family": self.family, "name": self.name, "capabilities": sorted(self.capabilities, key=str) }

    def _blank_ ( self, value: object ) -> bool:

        if value is None: return True
        if isinstance(value, str): return not value.strip()

        return isinstance(value, EMPTY) and not value
