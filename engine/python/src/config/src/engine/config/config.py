from typing import Any

from engine.error import Code, Fault
from engine.log import log
from .arch import Pairs, STAGE
from .settings import Settings
import os

class Config:

    def __init__ ( self ) -> None:

        self._groups: dict[str, Settings] = {}
        self._kinds: dict[str, type[Settings]] = {}

    def register [S: Settings] ( self, name: str, kind: type[S], source: Pairs | None = None ) -> S:

        found = self._groups.get(name)

        if isinstance(found, kind): return found
        if found is not None:

            raise Fault(Code.INTERNAL, f"Settings {name} are already {type(found).__name__}", "config.taken")

        loaded = kind.load(source)

        self._groups[name] = loaded
        self._kinds[name]  = kind

        log.debug("config.loaded", group=name, fields=len(kind.keys()))

        return loaded

    def of [S: Settings] ( self, kind: type[S] ) -> S:

        for group in self._groups.values():

            if isinstance(group, kind): return group

        raise Fault(Code.INTERNAL, f"Settings {kind.__name__} are not registered", "config.group")

    def get ( self, name: str ) -> Settings:

        found = self._groups.get(name)

        if found is None: raise Fault(Code.INTERNAL, f"Settings {name} are not registered", "config.group")

        return found

    def has ( self, name: str ) -> bool:

        return name in self._groups

    def names ( self ) -> tuple[str, ...]:

        return tuple(sorted(self._groups))

    def reload ( self, name: str, source: Pairs | None = None ) -> Settings:

        kind = self._kinds.get(name)

        if kind is None: raise Fault(Code.INTERNAL, f"Settings {name} are not registered", "config.group")

        self._groups[name] = kind.load(source)

        return self._groups[name]

    def forget ( self, name: str ) -> bool:

        self._kinds.pop(name, None)

        return self._groups.pop(name, None) is not None

    def clear ( self ) -> None:

        self._groups = {}
        self._kinds  = {}

    def stray ( self, source: Pairs | None = None ) -> list[str]:

        values = os.environ if source is None else source
        heads  = tuple({ kind.head() for kind in self._kinds.values() if kind.head() })
        known  = { STAGE, *(key for kind in self._kinds.values() for key in kind.keys().values()) }

        return sorted(key for key in values if key.startswith(heads) and key not in known) if heads else []

    def describe ( self ) -> dict[str, dict[str, Any]]:

        return { name: group.describe() for name, group in sorted(self._groups.items()) }
