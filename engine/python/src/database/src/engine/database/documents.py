from collections.abc import Awaitable, Mapping, Sequence
from typing import Any, TYPE_CHECKING

from engine.error import Code, Fault
from engine.rand import rand
from .arch import cursor_size
from .model import Model
from .mongo import Mongo

if TYPE_CHECKING:

    from pymongo.asynchronous.collection import AsyncCollection

class Documents[M: Model]:

    def __init__ ( self, mongo: Mongo, model: type[M], collection: str | None = None ) -> None:

        table = getattr(model, "table", None)

        self._mongo  = mongo
        self._model  = model
        self._name   = collection or (table.name if table is not None else model.__name__.lower())
        self._key    = table.primary() if table is not None else "id"
        self._fields = frozenset(member.name for member in model.members())

    def name ( self ) -> str:

        return self._name

    def make ( self, **values: Any ) -> M:

        return self._model.from_mapping(values)

    async def find ( self, key: Any ) -> M | None:

        found = await self._guard_(self._collection_().find_one({ "_id": key }))

        return self._load_(found) if found else None

    async def need ( self, key: Any ) -> M:

        found = await self.find(key)

        if found is None: raise Fault(Code.NOT_FOUND, reason=f"{self._name}.missing")

        return found

    async def first ( self, **where: Any ) -> M | None:

        found = await self._guard_(self._collection_().find_one(self._filter_(where)))

        return self._load_(found) if found else None

    async def all ( self, order: str | None = None, **where: Any ) -> list[M]:

        cursor = self._collection_().find(self._filter_(where))

        if order: cursor = cursor.sort(*self._order_(order))

        return [self._load_(document) for document in await self._guard_(cursor.to_list())]

    async def page ( self, page: int, limit: int, order: str = "created_at", **where: Any ) -> tuple[list[M], int]:

        total  = await self.count(**where)
        cursor = self._collection_().find(self._filter_(where)).sort(*self._order_(order))
        cursor = cursor.skip((max(1, page) - 1) * max(1, limit)).limit(max(1, limit))

        return [self._load_(document) for document in await self._guard_(cursor.to_list())], total

    async def cursor ( self, after: Any = None, limit: int = 100, **where: Any ) -> list[M]:

        size   = cursor_size(limit)
        query  = self._filter_(where)

        if after is not None: query = { "$and": [query, { "_id": { "$gt": after } }] }

        cursor = self._collection_().find(query).sort("_id", 1).limit(size)

        return [self._load_(document) for document in await self._guard_(cursor.to_list())]

    async def count ( self, **where: Any ) -> int:

        return int(await self._guard_(self._collection_().count_documents(self._filter_(where))))

    async def exists ( self, **where: Any ) -> bool:

        return await self.first(**where) is not None

    async def create ( self, **values: Any ) -> M:

        made = self.make(**{ self._key: str(rand.uuid7()), **values })

        await self._guard_(self._collection_().insert_one(self._dump_(made)))

        return made

    async def insert_many ( self, rows: Sequence[Mapping[str, Any]] ) -> int:

        if not rows: return 0

        made = [self.make(**{ self._key: str(rand.uuid7()), **row }) for row in rows]

        await self._guard_(self._collection_().insert_many([self._dump_(row) for row in made]))

        return len(made)

    async def update ( self, key: Any, **values: Any ) -> M:

        self._known_(values)

        if self._key in values and values[self._key] != key: raise Fault(Code.INTERNAL, reason="database.primary")

        changes = { name: value for name, value in values.items() if name != self._key }
        found = await self._guard_(
            self._collection_().find_one_and_update({ "_id": key }, { "$set": changes }, return_document=True),
        )

        if found is None: raise Fault(Code.NOT_FOUND, reason=f"{self._name}.missing")

        return self._load_(found)

    async def delete ( self, key: Any ) -> bool:

        result = await self._guard_(self._collection_().delete_one({ "_id": key }))

        return int(result.deleted_count) == 1

    async def upsert ( self, conflict: Sequence[str], update: Sequence[str], **values: Any ) -> M:

        self._known_(dict.fromkeys((*conflict, *update)))

        if not conflict or any(name not in values for name in conflict):

            raise Fault(Code.INTERNAL, reason="database.conflict")

        if self._key in update: raise Fault(Code.INTERNAL, reason="database.primary")

        where   = { name: values[name] for name in conflict }
        found   = await self.first(**where)
        changes = { name: values[name] for name in update if name in values }

        if found is not None: return await self.update(getattr(found, self._key), **changes) if changes else found

        made     = self.make(**{ self._key: str(rand.uuid7()), **values })
        initial  = self._dump_(made)
        assigned = { name: initial[name] for name in changes }

        for name in assigned: initial.pop(name)

        operation = { "$setOnInsert": initial }

        if assigned: operation["$set"] = assigned

        result = await self._guard_(self._collection_().find_one_and_update(
            self._filter_(where), operation, upsert=True, return_document=True,
        ))

        if result is None: raise Fault(Code.INTERNAL, reason=f"{self._name}.upsert")

        return self._load_(result)

    def _collection_ ( self ) -> AsyncCollection[dict[str, Any]]:

        return self._mongo.collection(self._name)

    async def _guard_ [T] ( self, awaitable: Awaitable[T] ) -> T:

        try: return await awaitable
        except self._mongo.failures as error: raise self._mongo.translate(error) from error

    def _known_ ( self, names: Mapping[str, Any] ) -> None:

        unknown = sorted(set(names) - self._fields)

        if unknown:

            raise Fault(Code.INTERNAL, reason="database.column", errors={ name: ["is unknown"] for name in unknown })

    def _filter_ ( self, where: Mapping[str, Any] ) -> dict[str, Any]:

        self._known_(where)

        return { ("_id" if name == self._key else name): value for name, value in where.items() }

    def _order_ ( self, order: str ) -> tuple[str, int]:

        column = order.removeprefix("-")

        if column not in self._model.sortable:

            raise Fault(Code.VALIDATION, reason="database.order", errors={ "order": [f"{column} is not sortable"] })

        return ("_id" if column == self._key else column), -1 if order.startswith("-") else 1

    def _load_ ( self, document: Mapping[str, Any] ) -> M:

        plain = { (self._key if name == "_id" else name): value for name, value in document.items() }

        return self._model.from_row(plain)

    def _dump_ ( self, row: M ) -> dict[str, Any]:

        plain = row.dump()

        plain["_id"] = plain.pop(self._key)

        return plain
