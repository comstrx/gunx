from collections.abc import Mapping, Sequence
from typing import Any

from engine.adapter import Manager
from engine.database import Dialect, POSTGRES, Table
from engine.error import Code, Fault
from .arch import Document, Query, Result, Schema
from .database import Database
from .engine import Engine

class Search:

    def __init__ ( self ) -> None:

        self._manager: Manager[Engine] = Manager("search")
        self._schemas: dict[str, Schema] = {}
        self._queries = 0
        self._indexed = 0

    @staticmethod
    def blueprint ( name: str, dialect: Dialect = POSTGRES ) -> Table:

        return Database.blueprint(name, dialect)

    def setup ( self, engine: Engine | None = None ) -> None:

        if engine is not None: self._manager.use(engine, default=True)

    def use ( self, engine: Engine, default: bool = False ) -> Engine:

        return self._manager.use(engine, default)

    def engine ( self, name: str | None = None ) -> Engine:

        return self._manager.get(name)

    def ready ( self ) -> bool:

        return self._manager.ready()

    def names ( self ) -> tuple[str, ...]:

        return self._manager.names()

    def schema ( self, index: str ) -> Schema:

        found = self._schemas.get(index)

        if found is None: raise Fault(Code.NOT_FOUND, reason="search.index", errors={ "index": [index] })

        return found

    async def prepare (
        self, index: str, searchable: Sequence[str], filterable: Sequence[str] = (), sortable: Sequence[str] = (),
        engine: str | None = None,
    ) -> Schema:

        if not searchable: raise Fault(Code.INTERNAL, reason="search.schema", errors={ "searchable": ["is empty"] })

        made = Schema(tuple(searchable), tuple(filterable), tuple(sortable))

        await self.engine(engine).prepare(index, made)

        self._schemas[index] = made

        return made

    def document ( self, item: Document | Mapping[str, Any] ) -> Document:

        if isinstance(item, Document): return item

        fields = dict(item)
        id_    = fields.pop("id", None)

        if id_ is None or str(id_) == "": raise Fault(Code.VALIDATION, reason="search.id")

        return Document(str(id_), fields)

    async def index ( self, index: str, *items: Document | Mapping[str, Any], engine: str | None = None ) -> int:

        documents = [self.document(item) for item in items]

        if not documents: return 0

        count = await self.engine(engine).index(index, documents)

        self._indexed += count

        return count

    async def get ( self, index: str, id_: str, engine: str | None = None ) -> Document | None:

        return await self.engine(engine).get(index, id_)

    async def query ( self, index: str, text: str = "", engine: str | None = None, **options: Any ) -> Result:

        made   = Query(text, **options)
        result = await self.engine(engine).query(index, made)

        self._queries += 1

        return result

    async def suggest ( self, index: str, prefix: str, limit: int = 5, engine: str | None = None ) -> list[str]:

        chosen = self.engine(engine)

        chosen.ensure("suggest")

        return await chosen.suggest(index, prefix, limit)

    async def delete ( self, index: str, *ids: str, engine: str | None = None ) -> int:

        return await self.engine(engine).delete(index, list(ids))

    async def clear ( self, index: str, engine: str | None = None ) -> int:

        return await self.engine(engine).clear(index)

    async def drop ( self, index: str, engine: str | None = None ) -> bool:

        self._schemas.pop(index, None)

        return await self.engine(engine).drop(index)

    async def count ( self, index: str, engine: str | None = None ) -> int:

        return await self.engine(engine).count(index)

    def stats ( self ) -> dict[str, int]:

        return { "queries": self._queries, "indexed": self._indexed, "indexes": len(self._schemas) }

    def describe ( self ) -> dict[str, Any]:

        return { **self._manager.describe(), **self.stats() }

    async def close ( self ) -> None:

        await self._manager.close()
