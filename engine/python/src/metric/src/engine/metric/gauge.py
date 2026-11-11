from collections.abc import Iterator
from contextlib import contextmanager
from typing import ClassVar

from .meter import Meter

class Gauge(Meter):

    kind : ClassVar[str] = "gauge"

    def set ( self, value: float, **labels: str ) -> None:

        fixed = float(self._number_(value))
        cell  = self._cell_(labels)

        if cell is not None: cell[0] = fixed

    def add ( self, amount: float, **labels: str ) -> None:

        self._number_(amount)

        cell = self._cell_(labels)

        if cell is None: return

        with self._lock: cell[0] += amount

    def value ( self, **labels: str ) -> float:

        cell = self._cell_(labels, read=True)

        return 0.0 if cell is None else cell[0]

    @contextmanager
    def track ( self, **labels: str ) -> Iterator[None]:

        self.add(1, **labels)

        try: yield
        finally: self.add(-1, **labels)
