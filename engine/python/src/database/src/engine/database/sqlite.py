from collections.abc import Mapping
from typing import ClassVar, override

from engine.error import Code, Fault
from .arch import EMPTY, KEY, NOW, UUID
from .dialect import Dialect

class Sqlite(Dialect):

    name         = "sqlite"
    marker       = "?"
    kinds        : ClassVar[Mapping[str, str]] = {
        "uuid": "uuid", "text": "text", "integer": "integer", "bigint": "bigint", "boolean": "boolean",
        "numeric": "numeric", "timestamp": "timestamp", "date": "date", "jsonb": "jsonb", "bytes": "blob",
    }
    reverse      : ClassVar[Mapping[str, str]] = {
        "uuid": "uuid", "text": "text", "integer": "integer", "bigint": "bigint", "boolean": "boolean",
        "numeric": "numeric", "timestamp": "timestamp", "date": "date", "jsonb": "jsonb", "blob": "bytes",
    }
    defaults     : ClassVar[Mapping[str, str | None]] = {
        NOW: "CURRENT_TIMESTAMP", UUID: None, EMPTY: "'{}'", "true": "1", "false": "0",
    }
    capabilities = frozenset({ "returning", "upsert", "transaction", "savepoint", "check", "foreign", "partial" })

    @override
    def operator ( self, operator: str ) -> str:

        return "LIKE" if operator == "ILIKE" else operator

    @override
    def json ( self, column: str, key: str ) -> str:

        if not KEY.match(key): raise Fault(Code.INTERNAL, reason="sql.key", errors={ "key": [key[:64]] })

        return f"json_extract({self.ident(column)}, '$.{key}')"

SQLITE     = Sqlite()
