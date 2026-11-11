from collections.abc import Sequence
from dataclasses import dataclass, field, replace
from typing import Any

from engine.error import Code, Fault
from .column import Column
from .dialect import Dialect
from .index import Index
from .postgres import POSTGRES
from .sql import Sql

@dataclass(frozen=True, slots=True)
class Table:

    name     : str
    columns  : tuple[Column, ...]
    indexes  : tuple[Index, ...] = ()
    isolated : str | None = None
    policies : tuple[tuple[str, str], ...] = ()
    history  : tuple[str, ...] = field(default_factory=tuple)

    def __post_init__ ( self ) -> None:

        Sql.quote(self.name)

        names = [column.name for column in self.columns]

        if len(set(names)) != len(names):

            raise Fault(Code.INTERNAL, reason="table.duplicate", errors={ self.name: names })

        if not any(column.primary for column in self.columns):

            raise Fault(Code.INTERNAL, reason="table.primary", errors={ self.name: ["no primary key"] })

    @classmethod
    def define (
        cls, name: str, *columns: Column, indexes: Sequence[Index] = (), isolated: str | None = None,
        timestamps: bool = True, soft: bool = False, policies: Sequence[tuple[str, str]] = (),
    ) -> Table:

        extra: list[Column] = []

        if timestamps: extra += [Column.timestamp("created_at", now=True), Column.timestamp("updated_at", now=True)]
        if soft: extra.append(Column.timestamp("deleted_at", nullable=True))

        return cls(name, (*columns, *extra), tuple(indexes), isolated, tuple(policies))

    def guarded ( self ) -> bool:

        return bool(self.isolated or self.policies)

    def column ( self, name: str ) -> Column:

        for column in self.columns:

            if column.name == name: return column

        raise Fault(Code.INTERNAL, reason="table.column", errors={ self.name: [name] })

    def has ( self, name: str ) -> bool:

        return any(column.name == name for column in self.columns)

    def names ( self ) -> tuple[str, ...]:

        return tuple(column.name for column in self.columns)

    def kinds ( self ) -> dict[str, str]:

        return { column.name: column.kind for column in self.columns }

    def primary ( self ) -> str:

        return next(column.name for column in self.columns if column.primary)

    def references ( self ) -> tuple[Index, ...]:

        return tuple(Index((column.name,)) for column in self.columns if column.foreign and not column.unique)

    def every_index ( self ) -> tuple[Index, ...]:

        wanted = list(self.indexes)

        for index in self.references():

            if all(existing.columns != index.columns for existing in wanted): wanted.append(index)

        if self.isolated and all(existing.columns[0] != self.isolated for existing in wanted):

            wanted.insert(0, Index((self.isolated,)))

        return tuple(wanted)

    def create ( self, dialect: Dialect = POSTGRES ) -> list[str]:

        return dialect.table(self)

    def policy ( self, dialect: Dialect = POSTGRES ) -> list[str]:

        return dialect.policy(self)

    def with_column ( self, column: Column ) -> Table:

        return replace(self, columns=(*self.columns, column))

    def without ( self, name: str ) -> Table:

        return replace(self, columns=tuple(column for column in self.columns if column.name != name))

    def describe ( self ) -> dict[str, Any]:

        return {
            "name"     : self.name,
            "columns"  : [column.name for column in self.columns],
            "indexes"  : [index.name(self.name) for index in self.every_index()],
            "isolated" : self.isolated,
            "policies" : [name for name, _ in self.policies],
        }
