from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from engine.date import date
from .arch import Failure, Filter, Hook, TIMEOUT, Work
from .cron import Cron

@dataclass(slots=True)
class Spot:

    name     : str
    cron     : Cron
    work     : Work
    timeout  : float = TIMEOUT
    overlap  : bool = False
    runs     : int = 0
    failures : int = 0
    last     : datetime | None = None
    next     : datetime = field(default_factory=date.now)
    busy     : bool = False
    interval : float | None = None
    zone     : str | None = None
    filters  : list[Filter] = field(default_factory=list)
    window   : tuple[tuple[int, int], tuple[int, int]] | None = None
    blackout : tuple[tuple[int, int], tuple[int, int]] | None = None
    failed   : list[Failure] = field(default_factory=list)
    starting : list[Hook] = field(default_factory=list)
    finished : list[Hook] = field(default_factory=list)
    succeeded: list[Hook] = field(default_factory=list)

    def allowed ( self, moment: datetime ) -> bool:

        if any(not keep() for keep in self.filters): return False
        if self.window is None and self.blackout is None: return True

        local = date.local(moment, self.zone or "UTC")
        now   = (local.hour, local.minute)

        if self.window is not None and not self._inside_(now, self.window): return False

        return self.blackout is None or not self._inside_(now, self.blackout)

    @staticmethod
    def _inside_ ( now: tuple[int, int], span: tuple[tuple[int, int], tuple[int, int]] ) -> bool:

        start, end = span

        return start <= now <= end if start <= end else now >= start or now <= end

    def describe ( self ) -> dict[str, Any]:

        return {
            "name": self.name, "cron": self.cron.text, "interval": self.interval, "zone": self.zone, "runs": self.runs,
            "failures": self.failures, "next": date.iso(self.next), "busy": self.busy,
        }
