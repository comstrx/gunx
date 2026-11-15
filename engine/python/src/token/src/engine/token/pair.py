from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class Pair:

    access  : str
    refresh : str
    expires : int

    def dump ( self ) -> dict[str, Any]:

        return { "access": self.access, "refresh": self.refresh, "expires": self.expires, "type": "Bearer" }
