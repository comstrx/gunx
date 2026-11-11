from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from typing import ClassVar, cast, override

from .arch import BOUNDS, BUCKETS, Cell, LIMIT, MOST, SERIES
from .meter import Meter
import bisect, itertools, time

class Histogram(Meter):

    kind     : ClassVar[str]             = "histogram"
    suffixes : ClassVar[tuple[str, ...]] = ("", "_bucket", "_sum", "_count")
    reserved : ClassVar[frozenset[str]]  = frozenset({ "le" })

    def __init__ ( self, name: str, help_: str = "", buckets: Sequence[float] = BUCKETS, series: int = SERIES ) -> None:

        super().__init__(name, help_, series)

        self._buckets = self._bounded_(buckets)
        self._bounds  = (*(self._figure_(bound) for bound in self._buckets), LIMIT)

    def observe ( self, value: float, **labels: str ) -> None:

        self._number_(value)

        cell = self._cell_(labels)

        if cell is None: return

        index = bisect.bisect_left(self._buckets, value) + 1

        with self._lock:

            cell[0]     += value
            cell[index] += 1

    def count ( self, **labels: str ) -> int:

        cell = self._cell_(labels, read=True)

        return 0 if cell is None else int(sum(cell[1:]))

    def sum ( self, **labels: str ) -> float:

        cell = self._cell_(labels, read=True)

        return 0.0 if cell is None else cell[0]

    def buckets ( self ) -> tuple[float, ...]:

        return self._buckets

    @contextmanager
    def time ( self, **labels: str ) -> Iterator[None]:

        self._cell_(labels, read=True)

        started = time.perf_counter()

        try: yield
        finally: self.observe(time.perf_counter() - started, **labels)

    @override
    def _fresh_ ( self ) -> Cell:

        return [0.0] * (len(self._buckets) + 2)

    @override
    def _rows_ ( self, name: str, text: str, cell: Cell ) -> list[str]:

        joint   = f"{text}," if text else ""
        running = 0
        rows: list[str] = []

        for bound, count in zip(self._bounds, cell[1:], strict=True):

            running += int(count)

            rows.append(f'{name}_bucket{{{joint}le="{bound}"}} {running}')

        return [*rows, self._row_(f"{name}_sum", text, cell[0]), self._row_(f"{name}_count", text, running)]

    def _bounded_ ( self, buckets: Sequence[float] ) -> tuple[float, ...]:

        held = cast("object", buckets)
        fine = isinstance(held, (tuple, list)) and 0 < len(held) <= BOUNDS

        if not fine or any(type(bound) not in (int, float) or not -MOST <= bound <= MOST for bound in buckets):
            raise self._refused_("buckets", self.name)

        bounds = tuple(float(bound) for bound in buckets)

        if any(low >= high for low, high in itertools.pairwise(bounds)): raise self._refused_("buckets", self.name)

        return bounds
