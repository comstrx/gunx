from collections.abc import AsyncIterator, Iterable, Mapping, Sequence
from contextlib import asynccontextmanager
from operator import attrgetter
from typing import Any

from engine.error import Code, Fault
from engine.health import health
from engine.rand import rand
from .model import Model

class Memory[M: Model]:

    def __init__ ( self, model: type[M], rows: Iterable[M] = () ) -> None:

        table = getattr(model, "table", None)

        self._model  = model
        self._name   = table.name if table is not None else model.__name__.lower()
        self._key    = table.primary() if table is not None else "id"
        self._uuid   = table is None or table.column(self._key).kind == "uuid"
        self._fields = frozenset(member.name for member in model.members())
        self._rows: dict[Any, M] = {}

        for row in rows: self._rows[getattr(row, self._key)] = row

    def name ( self ) -> str:

        return self._name

    @asynccontextmanager
    async def run ( self ) -> AsyncIterator[None]:

        health.register(self._name, self.ready)

        try: yield
        finally: health.forget(self._name)

    async def ready ( self ) -> bool:

        return len(self._rows) > 0

    def snapshot ( self ) -> tuple[M, ...]:

        return tuple(self._rows.values())

    def make ( self, **values: Any ) -> M:

        return self._model.from_mapping(values)

    async def find ( self, key: Any ) -> M | None:

        return self._rows.get(key)

    async def need ( self, key: Any ) -> M:

        found = self._rows.get(key)

        if found is None: raise Fault(Code.NOT_FOUND, reason=f"{self._name}.missing")

        return found

    async def first ( self, **where: Any ) -> M | None:

        return next(iter(self._match_(where)), None)

    async def all ( self, order: str | None = None, **where: Any ) -> list[M]:

        found = self._match_(where)

        return self._sorted_(found, order) if order else found

    async def page ( self, page: int, limit: int, order: str | None = None, **where: Any ) -> tuple[list[M], int]:

        found = await self.all(order, **where)
        start = (max(1, page) - 1) * max(1, limit)

        return found[start:start + max(1, limit)], len(found)

    async def count ( self, **where: Any ) -> int:

        return len(self._match_(where))

    async def exists ( self, **where: Any ) -> bool:

        return await self.first(**where) is not None

    async def create ( self, **values: Any ) -> M:

        if self._uuid and values.get(self._key) is None: values = { self._key: str(rand.uuid7()), **values }

        made = self.make(**values)
        key  = getattr(made, self._key)

        if key in self._rows:

            raise Fault(Code.CONFLICT, "Already exists", "database.unique", { self._key: ["is taken"] })

        self._rows[key] = made

        return made

    async def insert_many ( self, rows: Sequence[Mapping[str, Any]] ) -> int:

        for row in rows: await self.create(**row)

        return len(rows)

    async def update ( self, key: Any, **values: Any ) -> M:

        found = await self.need(key)
        made  = self.make(**{ **self._plain_(found), **values })

        self._rows.pop(key)
        self._rows[getattr(made, self._key)] = made

        return made

    async def delete ( self, key: Any ) -> bool:

        return self._rows.pop(key, None) is not None

    async def upsert ( self, conflict: Sequence[str], update: Sequence[str], **values: Any ) -> M:

        found = await self.first(**{ name: values[name] for name in conflict })

        if found is None: return await self.create(**values)

        changes = { name: values[name] for name in update if name in values }

        return await self.update(getattr(found, self._key), **changes)

    def _match_ ( self, where: Mapping[str, Any] ) -> list[M]:

        unknown = sorted(set(where) - self._fields)

        if unknown:

            raise Fault(Code.INTERNAL, reason="database.column", errors={ name: ["is unknown"] for name in unknown })

        return [row for row in self._rows.values() if all(getattr(row, name) == value for name, value in where.items())]

    def _sorted_ ( self, rows: list[M], order: str ) -> list[M]:

        column = order.removeprefix("-")

        if column not in self._model.sortable or column not in self._fields:

            raise Fault(Code.VALIDATION, reason="database.order", errors={ "order": [f"{column} is not sortable"] })

        return sorted(rows, key=attrgetter(column), reverse=order.startswith("-"))

    def _plain_ ( self, row: M ) -> dict[str, Any]:

        return { name: getattr(row, name) for name in self._fields }
