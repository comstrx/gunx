from collections.abc import Mapping, Sequence
from typing import Any, ClassVar, TYPE_CHECKING

from engine.error import Code, Fault
from .arch import IDENT, KEY, TOKEN
import re

if TYPE_CHECKING:

    from .index import Index
    from .column import Column
    from .table import Table

class Dialect:

    name         : ClassVar[str] = ""
    quote        : ClassVar[str] = '"'
    marker       : ClassVar[str] = "$"
    kinds        : ClassVar[Mapping[str, str]] = {}
    reverse      : ClassVar[Mapping[str, str]] = {}
    defaults     : ClassVar[Mapping[str, str | None]] = {}
    capabilities : ClassVar[frozenset[str]] = frozenset()

    def can ( self, capability: str ) -> bool:

        return capability in self.capabilities

    def ensure ( self, capability: str ) -> None:

        if capability in self.capabilities: return

        message = f"{self.name} cannot {capability}"

        raise Fault(Code.INTERNAL, message, "sql.capability", { "capability": [capability] })

    def ident ( self, name: str, star: bool = False ) -> str:

        if star and name == "*": return name
        if not IDENT.match(name): raise Fault(Code.INTERNAL, reason="sql.identifier", errors={ "name": [name[:64]] })

        return ".".join(f"{self.quote}{part}{self.quote}" for part in name.split("."))

    def render ( self, text: str, params: Sequence[Any] ) -> tuple[str, list[Any]]:

        ordered: list[Any] = []
        places: dict[int, int] = {}

        def place ( found: re.Match[str] ) -> str:

            index = int(found.group(1))

            if self.marker == "$" and index in places: return self.placeholder(places[index])

            ordered.append(params[index])
            places[index] = len(ordered)

            return self.placeholder(len(ordered))

        if self.marker == "%s": text = text.replace("%", "%%")

        return TOKEN.sub(place, text), ordered

    def placeholder ( self, position: int ) -> str:

        return f"${position}" if self.marker == "$" else self.marker

    def kind ( self, column: Column ) -> str:

        base = self.kinds.get(column.kind)

        if base is None: self.ensure(column.kind)

        return str(base).format(length=column.length or self.length(column.kind))

    def length ( self, kind: str ) -> int:

        return { "vector": 1536, "numeric": 18, "text": 255 }.get(kind, 0)

    def default ( self, text: str | None ) -> str | None:

        if text is None: return None

        return self.defaults.get(text, text)

    def column ( self, column: Column ) -> str:

        parts   = [self.ident(column.name), self.kind(column)]
        default = self.default(column.default)

        if column.generated: return " ".join([*parts, self.generated(column.generated)])

        if column.primary: parts.append("PRIMARY KEY")
        if not column.nullable: parts.append("NOT NULL")
        if default is not None: parts.append(f"DEFAULT {default}")
        if column.unique and not column.primary: parts.append("UNIQUE")
        if column.check and self.can("check"): parts.append(f"CHECK ({column.check})")
        if column.foreign and self.can("foreign"):

            table, _, key = column.foreign.partition(".")

            parts.append(f"REFERENCES {self.ident(table)} ({self.ident(key or 'id')}) ON DELETE {column.on_delete}")

        return " ".join(parts)

    def generated ( self, expression: str ) -> str:

        return f"GENERATED ALWAYS AS ({expression}) STORED"

    def table ( self, table: Table ) -> list[str]:

        body = ",\n    ".join(self.column(column) for column in table.columns)

        return [f"CREATE TABLE IF NOT EXISTS {self.ident(table.name)} (\n    {body}\n)", *self.policy(table)]

    def policy ( self, table: Table ) -> list[str]:

        return []

    def index ( self, table: str, index: Index ) -> str | None:

        if index.where and not self.can("partial"): self.ensure("partial")

        kind  = "UNIQUE INDEX" if index.unique else "INDEX"
        using = f" USING {index.using}" if index.using and self.can("using") else ""
        where = f" WHERE {index.where}" if index.where else ""
        cols  = ", ".join(self.ident(column) if "(" not in column else column for column in index.columns)
        head  = f"CREATE {kind}{self.online()} IF NOT EXISTS {self.ident(index.name(table))}"

        return f"{head} ON {self.ident(table)}{using} ({cols}){where}"

    def online ( self ) -> str:

        return ""

    def add ( self, table: str, column: Column ) -> str:

        return f"ALTER TABLE {self.ident(table)} ADD COLUMN {self.column(column)}"

    def drop ( self, table: str, name: str ) -> str:

        return f"ALTER TABLE {self.ident(table)} DROP COLUMN {self.ident(name)}"

    def rename ( self, table: str, old: str, new: str ) -> str:

        return f"ALTER TABLE {self.ident(table)} RENAME COLUMN {self.ident(old)} TO {self.ident(new)}"

    def retype ( self, table: str, column: Column ) -> str | None:

        return None

    def nullability ( self, table: str, column: Column, nullable: bool ) -> str | None:

        return None

    def truncate ( self, table: str ) -> str:

        return f"DELETE FROM {self.ident(table)}"

    def remove ( self, table: str ) -> str:

        return f"DROP TABLE IF EXISTS {self.ident(table)}"

    def lock ( self, milliseconds: int ) -> str | None:

        return None

    def upsert ( self, conflict: Sequence[str], update: Sequence[str] ) -> str:

        self.ensure("upsert")

        target = ", ".join(self.ident(column) for column in conflict)
        sets   = ", ".join(f"{self.ident(c)} = EXCLUDED.{self.ident(c)}" for c in update)

        return f"ON CONFLICT ({target}) {f'DO UPDATE SET {sets}' if update else 'DO NOTHING'}"

    def operator ( self, operator: str ) -> str:

        return operator

    def search ( self, column: str, language: str, text: str ) -> str:

        self.ensure("search")

        return f"{self.ident(column)} @@ plainto_tsquery({language}, {text})"

    def distance ( self, column: str, token: str ) -> str:

        self.ensure("vector")

        return f"({self.ident(column)} <=> {token}::vector)"

    def update_head ( self, table: str ) -> str:

        return f"UPDATE {self.ident(table)} SET"

    def json ( self, column: str, key: str ) -> str:

        if not KEY.match(key): raise Fault(Code.INTERNAL, reason="sql.key", errors={ "key": [key[:64]] })

        return f"{self.ident(column)} ->> '{key}'"

    def setting ( self, name: str, kind: str = "uuid" ) -> str:

        self.ensure("scope")

        if not KEY.match(name) or not KEY.match(kind):

            raise Fault(Code.INTERNAL, reason="sql.key", errors={ "key": [name[:64]] })

        return f"NULLIF(current_setting('app.{name}', true), '')::{kind}"

    def returning ( self, columns: Sequence[str] ) -> str:

        self.ensure("returning")

        return f" RETURNING {', '.join(columns)}"

    def describe ( self ) -> dict[str, Any]:

        return { "name": self.name, "capabilities": sorted(self.capabilities) }
