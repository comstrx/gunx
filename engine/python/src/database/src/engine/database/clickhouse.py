from collections.abc import Mapping
from typing import ClassVar, override

from engine.error import Code, Fault
from .arch import EMPTY, KEY, NOW, UUID
from .column import Column
from .dialect import Dialect
from .index import Index
from .table import Table

class Clickhouse(Dialect):

    name         = "clickhouse"
    quote        = "`"
    marker       = "%s"
    kinds        : ClassVar[Mapping[str, str]] = {
        "uuid": "UUID", "text": "String", "integer": "Int32", "bigint": "Int64", "boolean": "Bool",
        "numeric": "Decimal({length}, 2)", "timestamp": "DateTime64(6, 'UTC')", "date": "Date32", "jsonb": "JSON",
        "bytes": "String", "vector": "Array(Float32)",
    }
    reverse      : ClassVar[Mapping[str, str]] = {
        "UUID": "uuid", "String": "text", "Int32": "integer", "Int64": "bigint", "Bool": "boolean",
        "Decimal": "numeric", "DateTime64": "timestamp", "DateTime": "timestamp", "Date32": "date", "Date": "date",
        "JSON": "jsonb", "Array(Float32)": "vector",
    }
    defaults     : ClassVar[Mapping[str, str | None]] = { NOW: "now64(6)", UUID: "generateUUIDv4()", EMPTY: "'{}'" }
    capabilities = frozenset({ "vector", "ilike", "mutation" })

    @override
    def column ( self, column: Column ) -> str:

        kind    = self.kind(column)
        parts   = [self.ident(column.name), f"Nullable({kind})" if column.nullable and not column.primary else kind]
        default = self.default(column.default)

        if column.generated: parts.append(f"MATERIALIZED {column.generated}")
        elif default is not None: parts.append(f"DEFAULT {default}")

        return " ".join(parts)

    @override
    def table ( self, table: Table ) -> list[str]:

        body = ",\n    ".join(self.column(column) for column in table.columns)
        head = f"CREATE TABLE IF NOT EXISTS {self.ident(table.name)} (\n    {body}\n)"

        return [f"{head} ENGINE = MergeTree ORDER BY ({self.ident(table.primary())})"]

    @override
    def index ( self, table: str, index: Index ) -> str | None:

        return None

    @override
    def retype ( self, table: str, column: Column ) -> str:

        return self.nullability(table, column, column.nullable)

    @override
    def nullability ( self, table: str, column: Column, nullable: bool ) -> str:

        kind = self.kind(column)
        kind = f"Nullable({kind})" if nullable else kind

        return f"ALTER TABLE {self.ident(table)} MODIFY COLUMN {self.ident(column.name)} {kind}"

    @override
    def drop ( self, table: str, name: str ) -> str:

        return f"ALTER TABLE {self.ident(table)} DROP COLUMN IF EXISTS {self.ident(name)}"

    @override
    def truncate ( self, table: str ) -> str:

        return f"TRUNCATE TABLE IF EXISTS {self.ident(table)}"

    @override
    def distance ( self, column: str, token: str ) -> str:

        return f"cosineDistance({self.ident(column)}, {token})"

    @override
    def update_head ( self, table: str ) -> str:

        return f"ALTER TABLE {self.ident(table)} UPDATE"

    @override
    def json ( self, column: str, key: str ) -> str:

        if not KEY.match(key): raise Fault(Code.INTERNAL, reason="sql.key", errors={ "key": [key[:64]] })

        return f"JSONExtractString({self.ident(column)}, '{key}')"

CLICKHOUSE = Clickhouse()
