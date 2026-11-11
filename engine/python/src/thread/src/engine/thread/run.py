from dataclasses import dataclass
from typing import Any

from engine.error import Fault
from .arch import Outcome

@dataclass(frozen=True, slots=True)
class Run:

    mode     : str
    outcomes : tuple[Outcome, ...]
    ms       : float
    workers  : int

    def results ( self ) -> list[Any]:

        return [outcome.value for outcome in self.outcomes if outcome.ok()]

    def errors ( self ) -> list[Fault]:

        return [outcome.error for outcome in self.outcomes if outcome.error is not None]

    def ok ( self ) -> bool:

        return all(outcome.ok() for outcome in self.outcomes)

    def raise_first ( self ) -> Run:

        errors = self.errors()

        if errors: raise errors[0]

        return self

    def dump ( self ) -> dict[str, Any]:

        return {
            "mode": self.mode, "workers": self.workers, "ms": self.ms, "done": len(self.results()),
            "failed": len(self.errors()),
        }
