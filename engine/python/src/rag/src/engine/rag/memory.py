from collections.abc import Sequence
from typing import override

from .arch import Chunk, Hit
from .store import Store
import math

class Memory(Store):

    name = "memory"

    def __init__ ( self ) -> None:

        self._rows: dict[str, list[tuple[Chunk, tuple[float, ...]]]] = {}

    @override
    async def put ( self, chunks: Sequence[Chunk], vectors: Sequence[Sequence[float]] ) -> int:

        for chunk, vector in zip(chunks, vectors, strict=True):

            self._rows.setdefault(chunk.scope, []).append((chunk, tuple(float(value) for value in vector)))

        return len(chunks)

    @override
    async def drop ( self, scope: str, source: str | None = None ) -> int:

        rows = self._rows.get(scope, [])
        kept = [row for row in rows if source is not None and row[0].source != source]

        self._rows[scope] = kept

        return len(rows) - len(kept)

    @override
    async def search ( self, scope: str, vector: Sequence[float], limit: int ) -> list[Hit]:

        query  = tuple(float(value) for value in vector)
        scored = [(self._cosine_(query, held), chunk) for chunk, held in self._rows.get(scope, [])]

        scored.sort(key=lambda pair: -pair[0])

        return [Hit(chunk.source, chunk.index, chunk.text, score, dict(chunk.facts)) for score, chunk in scored[:limit]]

    @override
    async def count ( self, scope: str ) -> int:

        return len(self._rows.get(scope, []))

    def _cosine_ ( self, left: tuple[float, ...], right: tuple[float, ...] ) -> float:

        norm = math.sqrt(math.sumprod(left, left)) * math.sqrt(math.sumprod(right, right))

        return math.sumprod(left, right) / norm if norm else 0.0
