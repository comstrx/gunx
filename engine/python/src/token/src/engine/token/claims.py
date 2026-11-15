from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True, slots=True)
class Claims:

    subject : str
    kind    : str
    id      : str
    issued  : int
    expires : int
    facts   : dict[str, Any] = field(default_factory=dict)

    @property
    def purpose ( self ) -> str:

        return self.kind

    def get ( self, name: str, default: Any = None ) -> Any:

        return self.facts.get(name, default)
