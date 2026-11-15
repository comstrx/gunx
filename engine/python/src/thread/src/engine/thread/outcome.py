from dataclasses import dataclass
from typing import Any
from engine.error import Fault


@dataclass(frozen=True, slots=True)
class Outcome:

    index  : int
    value  : Any = None
    error  : Fault | None = None
    ms     : float = 0.0

    def ok ( self ) -> bool:

        return self.error is None
