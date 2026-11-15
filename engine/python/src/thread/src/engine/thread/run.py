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

        for outcome in self.outcomes:

            if outcome.error is not None: raise outcome.error

        return self

    def dump ( self ) -> dict[str, Any]:

        failed = sum(outcome.error is not None for outcome in self.outcomes)

        return {
            "mode": self.mode, "workers": self.workers, "ms": self.ms,
            "done": len(self.outcomes) - failed, "failed": failed,
        }
