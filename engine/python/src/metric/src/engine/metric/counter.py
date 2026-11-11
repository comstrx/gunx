from typing import ClassVar

from .arch import TOTAL
from .meter import Meter

class Counter(Meter):

    kind     : ClassVar[str]             = "counter"
    family   : ClassVar[str]             = TOTAL
    suffixes : ClassVar[tuple[str, ...]] = (TOTAL,)

    def inc ( self, amount: float = 1.0, **labels: str ) -> None:

        if self._number_(amount) < 0: raise self._refused_("negative", self.name)

        cell = self._cell_(labels)

        if cell is None: return

        with self._lock: cell[0] += amount

    def value ( self, **labels: str ) -> float:

        cell = self._cell_(labels, read=True)

        return 0.0 if cell is None else cell[0]
