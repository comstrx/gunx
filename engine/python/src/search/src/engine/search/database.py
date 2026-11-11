from collections.abc import Mapping, Sequence
from typing import Any, override

from engine.database import Column, Database as Source, Dialect, Index, POSTGRES, Sql, Table
from engine.error import Code, Fault
from engine.json import json
from .arch import Document, Hit, Query, Result, SAMPLE, Schema
from .engine import Engine
import time

class Database(Engine):

    name         = "database"
    capabilities = frozenset({ "index", "query", "filters", "sort", "facets", "highlight", "suggest", "create" })

    def __init__ ( self, database: Source, table: Table ) -> None:

        self._database = database
        self._table    = table
        self._schemas: dict[str, Schema] = {}

    @staticmethod
    def blueprint ( name: str, dialect: Dialect = POSTGRES ) -> Table:

        columns = [
            Column("id", "text", primary=True),
            Column.text("index"),
            Column.text("body", length=0),
            Column.jsonb("fields"),
        ]

        if dialect.can("search"): columns.append(Column.tsvector("document", "to_tsvector('simple', body)"))

        indexes = [Index(("index",)), *([Index(("document",), using="GIN")] if dialect.can("search") else [])]

        return Table.define(name, *columns, indexes=indexes, timestamps=False)

    @override
    async def prepare ( self, index: str, schema: Schema ) -> None:

        self._schemas[index] = schema

    @override
    async def index ( self, index: str, documents: Sequence[Document] ) -> int:

        schema = self._schema_(index)

        for document in documents:

            body = " ".join(str(document.fields.get(name) or "") for name in schema.searchable)
            sql  = Sql.insert(self._table.name).values(id=document.id, index=index, body=body, fields=document.fields)

            await self._database.execute(sql.conflict("id", update=["index", "body", "fields"]))

        return len(documents)

    @override
    async def get ( self, index: str, id_: str ) -> Document | None:

        row = await self._database.one(Sql.select(self._table.name, "id", "fields").equals(index=index, id=id_))

        return Document(str(row["id"]), self._fields_(row["fields"])) if row else None

    @override
    async def query ( self, index: str, query: Query ) -> Result:

        started = time.perf_counter()
        schema  = self._schema_(index)
        dialect = self._database.dialect()
        words   = self._tokens_(query.text)
        sql     = Sql.select(self._table.name, "id", "fields")

        self._filter_(sql, index, query, schema)
        self._rank_(sql, query, dialect)

        for name, descending in query.orders():

            schema.check("sort", name)

            sql.raw_order(f"{dialect.json('fields', name)} {'DESC' if descending else 'ASC'}")

        if not query.sort: sql.raw_order("score DESC").order("id")

        rows  = await self._database.fetch(sql.limit(query.limit, query.offset()))
        total = await self._total_(index, query, schema)
        shown = query.fields or schema.names()
        hits  = [self._hit_(row, shown, schema, words, query.highlight) for row in rows]

        return Result(hits, total, time.perf_counter() - started, await self._facets_(index, query, schema))

    @override
    async def suggest ( self, index: str, prefix: str, limit: int = 5 ) -> list[str]:

        wanted = self._tokens_(prefix)

        if not wanted: return []

        head = wanted[-1]
        sql  = Sql.select(self._table.name, "body").equals(index=index).where("body", "ILIKE", f"%{head}%")

        sql.limit(SAMPLE)

        seen: dict[str, int] = {}

        for row in await self._database.fetch(sql):

            for word in self._tokens_(row["body"]):

                if word.startswith(head): seen[word] = seen.get(word, 0) + 1

        return [word for word, _ in sorted(seen.items(), key=lambda pair: (-pair[1], pair[0]))[:limit]]

    @override
    async def delete ( self, index: str, ids: Sequence[str] ) -> int:

        if not ids: return 0

        sql = Sql.delete(self._table.name).equals(index=index).where("id", "IN", list(ids))

        return await self._database.execute(sql)

    @override
    async def clear ( self, index: str ) -> int:

        return await self._database.execute(Sql.delete(self._table.name).equals(index=index))

    @override
    async def drop ( self, index: str ) -> bool:

        await self.clear(index)

        return self._schemas.pop(index, None) is not None

    @override
    async def count ( self, index: str ) -> int:

        return int(await self._database.value(Sql.select(self._table.name).equals(index=index).count()) or 0)

    @override
    def describe ( self ) -> dict[str, object]:

        return { **super().describe(), "table": self._table.name, "indexes": sorted(self._schemas) }

    def _schema_ ( self, index: str ) -> Schema:

        found = self._schemas.get(index)

        if found is None: raise Fault(Code.NOT_FOUND, reason="search.index", errors={ "index": [index] })

        return found

    def _filter_ ( self, sql: Sql, index: str, query: Query, schema: Schema ) -> None:

        dialect = self._database.dialect()

        sql.equals(index=index)

        if query.text.strip():

            if dialect.can("search"): sql.search("document", query.text, "simple")
            else:

                for word in self._tokens_(query.text): sql.where("body", "ILIKE", f"%{word}%")

        for name, wanted in query.filters.items():

            schema.check("filter", name)

            path = dialect.json("fields", name)

            if isinstance(wanted, list | tuple | set | frozenset):

                values = [self._literal_(value) for value in wanted]
                marks  = ", ".join("?" for _ in values)

                sql.raw_where(f"{path} IN ({marks})", *values) if values else sql.raw_where("FALSE")

            else: sql.raw_where(f"{path} = ?", self._literal_(wanted))

    def _rank_ ( self, sql: Sql, query: Query, dialect: Dialect ) -> None:

        words = self._tokens_(query.text)

        if not words:

            sql.raw_columns("1.0 AS score")

            return

        if dialect.can("search"):

            sql.raw_column("ts_rank(document, plainto_tsquery(?, ?)) AS score", "simple", query.text)

            return

        parts  = ["(length(lower(body)) - length(replace(lower(body), ?, ''))) / ?" for _ in words]
        values = [value for word in words for value in (word, len(word))]

        sql.raw_column(f"({' + '.join(parts)}) AS score", *values)

    async def _total_ ( self, index: str, query: Query, schema: Schema ) -> int:

        sql = Sql.select(self._table.name)

        self._filter_(sql, index, query, schema)

        return int(await self._database.value(sql.count()) or 0)

    async def _facets_ ( self, index: str, query: Query, schema: Schema ) -> dict[str, dict[str, int]]:

        dialect = self._database.dialect()
        facets: dict[str, dict[str, int]] = {}

        for name in query.facets:

            schema.check("facet", name)

            path = dialect.json("fields", name)
            sql  = Sql.select(self._table.name).columns().raw_columns(f"{path} AS value", "COUNT(*) AS count")

            sql.raw_group(path)

            self._filter_(sql, index, query, schema)

            rows = await self._database.fetch(sql.raw_where(f"{path} IS NOT NULL"))
            held = { str(row["value"]): int(row["count"]) for row in rows }

            facets[name] = dict(sorted(held.items(), key=lambda pair: (-pair[1], pair[0])))

        return facets

    def _hit_ (
        self, row: Mapping[str, Any], shown: Sequence[str], schema: Schema, words: Sequence[str], lit: bool,
    ) -> Hit:

        fields = self._fields_(row["fields"])
        kept   = { name: fields.get(name) for name in shown if name in fields }
        marks  = { name: self._highlight_(fields.get(name), words) for name in schema.searchable } if lit else {}

        return Hit(str(row["id"]), float(row["score"] or 0.0), kept, marks)

    def _fields_ ( self, raw: Any ) -> dict[str, Any]:

        if isinstance(raw, str | bytes): return dict(json.loads(raw))

        return dict(raw or {})

    def _literal_ ( self, value: Any ) -> str:

        return value if isinstance(value, str) else json.dumps(value)
