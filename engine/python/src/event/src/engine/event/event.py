from collections.abc import Mapping
from typing import Any, override

from engine.date import date
from engine.rand import rand
from engine.validate import Shape, field, validator

class Event(Shape, kw_only=True):

    name    : str
    data    : dict[str, Any] = field(default_factory=dict)
    id      : str = field(default_factory=lambda: str(rand.uuid7()))
    at      : str = field(default_factory=date.iso)
    actor   : str | None = None
    tenant  : str | None = None
    source  : str = "engine"
    version : int = 1

    @override
    def dump ( self ) -> dict[str, Any]:

        return {
            "name": self.name, "data": self.data, "id": self.id, "at": self.at, "actor": self.actor,
            "tenant": self.tenant, "source": self.source, "version": self.version,
        }

    @classmethod
    def load ( cls, payload: Mapping[str, Any] ) -> Event:

        kept = { key: value for key, value in payload.items() if key in cls.fields() }

        return validator.shape(cls, kept)
