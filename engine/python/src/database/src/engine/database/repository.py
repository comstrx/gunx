from collections.abc import AsyncIterator, Mapping, Sequence
from contextlib import asynccontextmanager
from typing import Any

from engine.date import date
from engine.error import Code, Fault
from engine.health import health
from engine.rand import rand
from .database import Database
from .model import Model
from .sql import Sql
from .table import Table

class Repository[M: Model]:

    def __init__ ( self, database: Database, model: type[M] ) -> None:

        self.database = database
        self._model    = model
        self._table    = model.table
        self._primary  = model.table.primary()
        self._generate = model.table.column(self._primary).kind == "uuid"

    def table ( self ) -> Table:

        return self._table

    def name ( self ) -> str:

        return self._table.name

    @asynccontextmanager
    async def run ( self ) -> AsyncIterator[None]:

        health.register(self._table.name, self.ready)

        try: yield
        finally: health.forget(self._table.name)

    async def ready ( self ) -> bool:

        return await self.database.ping()

    def make ( self, **values: Any ) -> M:

        return self._model.from_mapping(values)

    def query ( self, *columns: str ) -> Sql:

        return Sql.select(self._table.name, *columns)

    async def find ( self, key: Any ) -> M | None:

        row = await self.database.one(self.query().equals(**{ self._primary: key }).limit(1))

        return self._model.from_row(row) if row else None

    async def need ( self, key: Any ) -> M:

        found = await self.find(key)

        if found is None: raise Fault(Code.NOT_FOUND, reason=f"{self._table.name}.missing")

        return found

    async def first ( self, **where: Any ) -> M | None:

        row = await self.database.one(self.query().equals(**where).limit(1))

        return self._model.from_row(row) if row else None

    async def where ( self, sql: Sql ) -> list[M]:

        return [self._model.from_row(row) for row in await self.database.fetch(sql)]

    async def all ( self, order: str | None = None, **where: Any ) -> list[M]:

        sql = self.query().equals(**where)

        if order: sql.order(*self._order_(order))

        return await self.where(sql)

    async def page ( self, page: int, limit: int, order: str = "created_at", **where: Any ) -> tuple[list[M], int]:

        total = await self.count(**where)
        sql   = self.query().equals(**where).order(*self._order_(order))

        sql.page(page, limit)

        return await self.where(sql), total

    async def count ( self, **where: Any ) -> int:

        return int(await self.database.value(self.query().equals(**where).count()) or 0)

    async def exists ( self, **where: Any ) -> bool:

        return await self.count(**where) > 0

    async def create ( self, **values: Any ) -> M:

        filled = self._fill_(values)

        if self._returns_():

            row = await self.database.one(Sql.insert(self._table.name).values(**filled).returning())

            if row is None: raise Fault(Code.INTERNAL, reason=f"{self._table.name}.insert")

            return self._model.from_row(row)

        await self.database.execute(Sql.insert(self._table.name).values(**filled))

        return await self.need(filled[self._primary])

    async def insert_many ( self, rows: Sequence[Mapping[str, Any]] ) -> int:

        if not rows: return 0

        filled  = [self._fill_(row) for row in rows]
        columns = list(filled[0])

        return await self.database.execute(Sql.insert(self._table.name).rows(columns, filled))

    async def update ( self, key: Any, **values: Any ) -> M:

        changes = dict(values)

        if self._table.has("updated_at") and "updated_at" not in changes: changes["updated_at"] = date.now()

        sql = Sql.update(self._table.name).set(**changes).equals(**{ self._primary: key })

        if self._returns_():

            row = await self.database.one(sql.returning())

            if row is None: raise Fault(Code.NOT_FOUND, reason=f"{self._table.name}.missing")

            return self._model.from_row(row)

        if await self.database.execute(sql) == 0 and not await self.exists(**{ self._primary: key }):

            raise Fault(Code.NOT_FOUND, reason=f"{self._table.name}.missing")

        return await self.need(key)

    async def delete ( self, key: Any ) -> bool:

        key_ = { self._primary: key }

        if self._table.has("deleted_at"):

            sql = Sql.update(self._table.name).set(deleted_at=date.now()).equals(**key_)

            sql.where("deleted_at", "IS", None)

            return await self.database.execute(sql) == 1

        return await self.database.execute(Sql.delete(self._table.name).equals(**key_)) == 1

    async def upsert ( self, conflict: Sequence[str], update: Sequence[str], **values: Any ) -> M:

        filled = self._fill_(values)
        sql    = Sql.insert(self._table.name).values(**filled).conflict(*conflict, update=update)

        if self._returns_():

            row = await self.database.one(sql.returning())

            if row is None: raise Fault(Code.INTERNAL, reason=f"{self._table.name}.upsert")

            return self._model.from_row(row)

        await self.database.execute(sql)

        found = await self.first(**{ name: filled[name] for name in conflict })

        if found is None: raise Fault(Code.INTERNAL, reason=f"{self._table.name}.upsert")

        return found

    def _fill_ ( self, values: Mapping[str, Any] ) -> dict[str, Any]:

        filled = dict(values)

        if self._generate and filled.get(self._primary) is None: filled = { self._primary: str(rand.uuid7()), **filled }

        return filled

    def _returns_ ( self ) -> bool:

        return self.database.dialect().can("returning")

    def _order_ ( self, order: str ) -> tuple[str, str]:

        column = order.removeprefix("-")

        if column not in self._model.sortable:

            raise Fault(Code.VALIDATION, reason="database.order", errors={ "order": [f"{column} is not sortable"] })

        return column, "desc" if order.startswith("-") else "asc"
