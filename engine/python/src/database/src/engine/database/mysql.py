from collections.abc import Mapping, Sequence
from typing import ClassVar, override

from engine.error import Code, Fault
from .arch import EMPTY, KEY, NOW, UUID
from .column import Column
from .dialect import Dialect

class Mysql(Dialect):

    name         = "mysql"
    quote        = "`"
    marker       = "%s"
    kinds        : ClassVar[Mapping[str, str]] = {
        "uuid": "char(36)", "text": "varchar({length})", "integer": "int", "bigint": "bigint", "boolean": "tinyint(1)",
        "numeric": "decimal({length}, 2)", "timestamp": "datetime(6)", "date": "date", "jsonb": "json", "bytes": "blob",
    }
    reverse      : ClassVar[Mapping[str, str]] = {
        "char": "uuid", "varchar": "text", "text": "text", "mediumtext": "text", "longtext": "text", "int": "integer",
        "bigint": "bigint", "tinyint": "boolean", "decimal": "numeric", "double": "numeric", "datetime": "timestamp",
        "timestamp": "timestamp", "date": "date", "json": "jsonb", "blob": "bytes", "longblob": "bytes",
    }
    defaults     : ClassVar[Mapping[str, str | None]] = {
        NOW: "CURRENT_TIMESTAMP(6)", UUID: "(UUID())", EMPTY: "('{}')", "true": "1", "false": "0",
    }
    capabilities = frozenset({ "upsert", "transaction", "savepoint", "check", "foreign", "lock", "skip" })

    @override
    def kind ( self, column: Column ) -> str:

        if column.kind == "text" and column.length == 0: return "text"

        return super().kind(column)

    @override
    def retype ( self, table: str, column: Column ) -> str:

        null = "" if column.nullable else " NOT NULL"

        return f"ALTER TABLE {self.ident(table)} MODIFY COLUMN {self.ident(column.name)} {self.kind(column)}{null}"

    @override
    def nullability ( self, table: str, column: Column, nullable: bool ) -> str:

        null = "" if nullable else " NOT NULL"

        return f"ALTER TABLE {self.ident(table)} MODIFY COLUMN {self.ident(column.name)} {self.kind(column)}{null}"

    @override
    def lock ( self, milliseconds: int ) -> str:

        return f"SET SESSION lock_wait_timeout = {max(1, int(milliseconds / 1000))}"

    @override
    def upsert ( self, conflict: Sequence[str], update: Sequence[str] ) -> str:

        first = self.ident(conflict[0])
        sets  = ", ".join(f"{self.ident(c)} = new.{self.ident(c)}" for c in update) or f"{first} = {first}"

        return f"AS new ON DUPLICATE KEY UPDATE {sets}"

    @override
    def operator ( self, operator: str ) -> str:

        return "LIKE" if operator == "ILIKE" else operator

    @override
    def json ( self, column: str, key: str ) -> str:

        if not KEY.match(key): raise Fault(Code.INTERNAL, reason="sql.key", errors={ "key": [key[:64]] })

        return f"JSON_UNQUOTE(JSON_EXTRACT({self.ident(column)}, '$.{key}'))"

MYSQL      = Mysql()
