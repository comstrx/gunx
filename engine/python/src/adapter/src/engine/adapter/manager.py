from engine.error import Code, Fault
from engine.log import log
from .adapter import Adapter
from .arch import FAMILY, NAME, WORD

class Manager[A: Adapter]:

    def __init__ ( self, family: str ) -> None:

        named = type(family) is str and FAMILY.fullmatch(family) is not None

        if not named: raise Fault(Code.INTERNAL, reason="adapter.family")

        self.family = family
        self._adapters: dict[str, A] = {}
        self._default: str | None = None

    def use ( self, adapter: A, default: bool = False ) -> A:

        held   = isinstance(adapter, Adapter)
        family = adapter.family if held else None

        if type(family) is not str or family != self.family:

            asked = self._word_(family) if held else type(adapter).__name__

            raise Fault(Code.INTERNAL, reason=f"{self.family}.family", errors={ "family": [asked] })

        name = adapter.name

        if type(name) is not str or NAME.fullmatch(name) is None:

            raise Fault(Code.INTERNAL, reason=f"{self.family}.name", errors={ "name": [self._word_(name)] })

        if not self._declared_(adapter.capabilities):

            raise Fault(Code.INTERNAL, reason=f"{self.family}.capabilities", errors={ "name": [name] })

        before   = self._adapters.get(name)
        replaced = before is not None and before is not adapter

        self._adapters[name] = adapter

        if default or self._default is None: self._default = name

        log.debug("adapter.registered", family=self.family, name=name, replaced=replaced)

        return adapter

    def get ( self, name: str | None = None ) -> A:

        chosen = (name or self._default) if name is None or type(name) is str else None
        found  = self._adapters.get(chosen) if chosen is not None else None

        if found is None:

            asked = "" if name is None else self._word_(name)

            raise Fault(Code.INTERNAL, f"No {self.family} adapter {asked}".strip(), f"{self.family}.adapter")

        return found

    def has ( self, name: str ) -> bool:

        return type(name) is str and name in self._adapters

    def names ( self ) -> tuple[str, ...]:

        return tuple(sorted(self._adapters))

    def default ( self ) -> str | None:

        return self._default

    def ready ( self ) -> bool:

        return bool(self._adapters)

    def matrix ( self ) -> dict[str, list[str]]:

        return { name: sorted(adapter.capabilities) for name, adapter in sorted(self._adapters.items()) }

    def supporting ( self, capability: str ) -> list[A]:

        return [adapter for adapter in self._adapters.values() if adapter.can(capability)]

    def forget ( self, name: str ) -> bool:

        if not self.has(name): return False

        del self._adapters[name]

        if self._default == name: self._default = next(iter(self._adapters), None)

        return True

    async def close ( self ) -> int:

        closed = 0

        for name, adapter in tuple(self._adapters.items()):

            try: await adapter.close()
            except Exception as failed:

                log.warning("adapter.close", family=self.family, name=name, kind=type(failed).__name__)

            else: closed += 1

        return closed

    def clear ( self ) -> None:

        self._adapters = {}
        self._default  = None

    def describe ( self ) -> dict[str, object]:

        return { "family": self.family, "default": self._default, "adapters": self.matrix() }

    def _word_ ( self, value: object ) -> str:

        return value[:WORD] if type(value) is str else type(value).__name__

    def _declared_ ( self, capabilities: object ) -> bool:

        if not isinstance(capabilities, frozenset): return False

        return all(type(capability) is str and 0 < len(capability) <= WORD for capability in capabilities)
