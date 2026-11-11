from collections.abc import Mapping
from typing import ClassVar, TYPE_CHECKING, override

from .dialect import Dialect

if TYPE_CHECKING:

    from .column import Column
    from .table import Table

class Postgres(Dialect):

    name         = "postgres"
    kinds        : ClassVar[Mapping[str, str]] = {
        "uuid": "uuid", "text": "text", "integer": "integer", "bigint": "bigint", "boolean": "boolean",
        "numeric": "numeric({length}, 2)", "timestamp": "timestamp with time zone", "date": "date", "jsonb": "jsonb",
        "bytes": "bytea", "vector": "vector({length})", "tsvector": "tsvector",
    }
    reverse      : ClassVar[Mapping[str, str]] = {
        "uuid": "uuid", "text": "text", "character varying": "text", "integer": "integer", "bigint": "bigint",
        "boolean": "boolean", "numeric": "numeric", "double precision": "numeric", "date": "date", "jsonb": "jsonb",
        "timestamp with time zone": "timestamp", "timestamp without time zone": "timestamp", "json": "jsonb",
        "bytea": "bytes", "vector": "vector", "tsvector": "tsvector",
    }
    capabilities = frozenset({
        "returning", "upsert", "transaction", "savepoint", "check", "foreign", "partial", "using", "concurrent", "rls",
        "search", "vector", "copy", "listen", "advisory", "lock", "scope", "ilike", "skip",
    })

    @override
    def policy ( self, table: Table ) -> list[str]:

        if not table.guarded(): return []

        owner = self.ident(table.name)
        rules = list(table.policies)

        if table.isolated:

            using = f"{self.ident(table.isolated)} = {self.setting('tenant')}"

            rules.insert(0, (f"{table.name}_isolation", using))

        made = [f"ALTER TABLE {owner} ENABLE ROW LEVEL SECURITY", f"ALTER TABLE {owner} FORCE ROW LEVEL SECURITY"]

        for name, using in rules:

            made.append(f"DROP POLICY IF EXISTS {self.ident(name)} ON {owner}")
            made.append(f"CREATE POLICY {self.ident(name)} ON {owner} USING ({using})")

        return made

    @override
    def online ( self ) -> str:

        return " CONCURRENTLY"

    @override
    def add ( self, table: str, column: Column ) -> str:

        return f"ALTER TABLE {self.ident(table)} ADD COLUMN IF NOT EXISTS {self.column(column)}"

    @override
    def drop ( self, table: str, name: str ) -> str:

        return f"ALTER TABLE {self.ident(table)} DROP COLUMN IF EXISTS {self.ident(name)}"

    @override
    def retype ( self, table: str, column: Column ) -> str:

        return f"ALTER TABLE {self.ident(table)} ALTER COLUMN {self.ident(column.name)} TYPE {self.kind(column)}"

    @override
    def nullability ( self, table: str, column: Column, nullable: bool ) -> str:

        action = "DROP NOT NULL" if nullable else "SET NOT NULL"

        return f"ALTER TABLE {self.ident(table)} ALTER COLUMN {self.ident(column.name)} {action}"

    @override
    def remove ( self, table: str ) -> str:

        return f"DROP TABLE IF EXISTS {self.ident(table)} CASCADE"

    @override
    def lock ( self, milliseconds: int ) -> str:

        return f"SET LOCAL lock_timeout = '{int(milliseconds)}ms'"

POSTGRES   = Postgres()
