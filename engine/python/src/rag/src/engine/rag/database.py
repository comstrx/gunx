from collections.abc import Mapping, Sequence
from typing import Any, override

from engine.database import Database as Source, Sql, Table, Vector
from engine.rand import rand
from .arch import Chunk, Hit
from .store import Store

class Database(Store):

    name = "database"

    def __init__ ( self, database: Source, table: Table ) -> None:

        self._database = database
        self._table    = table

    @override
    async def put ( self, chunks: Sequence[Chunk], vectors: Sequence[Sequence[float]] ) -> int:

        if not chunks: return 0

        rows = [
            {
                "id": str(rand.uuid7()), "scope": chunk.scope, "source": chunk.source, "position": chunk.index,
                "body": chunk.text, "facts": chunk.facts, "embedding": Vector(vector),
            }
            for chunk, vector in zip(chunks, vectors, strict=True)
        ]

        return await self._database.execute(Sql.insert(self._table.name).rows(list(rows[0]), rows))

    @override
    async def drop ( self, scope: str, source: str | None = None ) -> int:

        sql = Sql.delete(self._table.name).equals(scope=scope)

        if source is not None: sql.equals(source=source)

        return await self._database.execute(sql)

    @override
    async def search ( self, scope: str, vector: Sequence[float], limit: int ) -> list[Hit]:

        sql  = Sql.select(self._table.name, "source", "position", "body", "facts").equals(scope=scope)
        rows = await self._database.fetch(sql.nearest("embedding", vector).limit(limit))

        return [self._hit_(row) for row in rows]

    @override
    async def count ( self, scope: str ) -> int:

        return int(await self._database.value(Sql.select(self._table.name).equals(scope=scope).count()) or 0)

    def _hit_ ( self, row: Mapping[str, Any] ) -> Hit:

        facts = dict(row["facts"] or {})

        return Hit(str(row["source"]), int(row["position"]), str(row["body"]), float(row["score"]), facts)

    @override
    def describe ( self ) -> dict[str, object]:

        return { **super().describe(), "table": self._table.name }
