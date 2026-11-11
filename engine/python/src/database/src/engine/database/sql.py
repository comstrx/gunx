from collections.abc import Mapping, Sequence
from typing import Any, Self

from engine.error import Code, Fault
from .arch import IDENT, NAME, OPER, OPS
from .dialect import Dialect
from .postgres import POSTGRES
from .vector import Vector

class Sql:

    __slots__ = (
        "_columns", "_conflict", "_from", "_group", "_joins", "_kind", "_limit", "_lock", "_nearest", "_offset",
        "_order", "_params", "_returning", "_sets", "_table", "_values", "_where",
    )

    def __init__ ( self, kind: str, table: str ) -> None:

        self._kind      = kind
        self._table     = table
        self._from      = Sql.quote(table)
        self._columns: list[str] = []
        self._joins: list[str] = []
        self._where: list[str | tuple[str, str, str]] = []
        self._order: list[str] = []
        self._group: list[str] = []
        self._sets: list[str] = []
        self._values: list[list[str]] = []
        self._returning: list[str] = []
        self._params: list[Any] = []
        self._limit: int | None = None
        self._offset: int | None = None
        self._conflict: tuple[tuple[str, ...], tuple[str, ...]] | None = None
        self._nearest: tuple[str, str] | None = None
        self._lock = False

    @classmethod
    def select ( cls, table: str, *columns: str ) -> Self:

        made = cls("select", table)

        made._columns = [Sql.quote(column, star=True) for column in columns] or ["*"]

        return made

    @classmethod
    def insert ( cls, table: str ) -> Self:

        return cls("insert", table)

    @classmethod
    def update ( cls, table: str ) -> Self:

        return cls("update", table)

    @classmethod
    def delete ( cls, table: str ) -> Self:

        return cls("delete", table)

    def bind ( self, value: Any ) -> str:

        self._params.append(value)

        return f"\x1f{len(self._params) - 1}\x1f"

    def columns ( self, *columns: str ) -> Self:

        self._columns = [Sql.quote(column, star=True) for column in columns]

        return self

    def raw_columns ( self, *expressions: str ) -> Self:

        self._columns.extend(expressions)

        return self

    def raw_column ( self, expression: str, *values: Any ) -> Self:

        rendered = expression

        for value in values: rendered = rendered.replace("?", self.bind(value), 1)

        self._columns.append(rendered)

        return self

    def raw_order ( self, expression: str, *values: Any ) -> Self:

        rendered = expression

        for value in values: rendered = rendered.replace("?", self.bind(value), 1)

        self._order.append(rendered)

        return self

    def join ( self, table: str, left: str, right: str, kind: str = "INNER" ) -> Self:

        self._joins.append(f"{kind} JOIN {Sql.quote(table)} ON {Sql.quote(left)} = {Sql.quote(right)}")

        return self

    def where ( self, column: str, operator: str, value: Any = None ) -> Self:

        op = operator.upper()

        if op not in OPS: raise Fault(Code.INTERNAL, reason="sql.operator", errors={ "operator": [operator] })

        if op in ("IN", "NOT IN"):

            items = list(value or [])

            if not items: self._where.append("FALSE" if op == "IN" else "TRUE")
            else: self._where.append(f"{Sql.quote(column)} {op} ({', '.join(self.bind(item) for item in items)})")

            return self

        if op in ("IS", "IS NOT") and value is None: self._where.append(f"{Sql.quote(column)} {op} NULL")
        else: self._where.append(f"{Sql.quote(column)} \x1d{op}\x1d {self.bind(value)}")

        return self

    def equals ( self, **pairs: Any ) -> Self:

        for column, value in pairs.items(): self.where(column, "IS" if value is None else "=", value)

        return self

    def raw_where ( self, fragment: str, *values: Any ) -> Self:

        rendered = fragment

        for value in values: rendered = rendered.replace("?", self.bind(value), 1)

        self._where.append(f"({rendered})")

        return self

    def search ( self, column: str, text: str, language: str = "simple" ) -> Self:

        Sql.quote(column)

        self._where.append((column, self.bind(language), self.bind(text)))

        return self

    def nearest ( self, column: str, vector: Vector | Sequence[float] ) -> Self:

        made = vector if isinstance(vector, Vector) else Vector(vector)

        Sql.quote(column)

        self._nearest = (column, self.bind(made))

        return self

    def order ( self, column: str, direction: str = "asc" ) -> Self:

        if direction.lower() not in ("asc", "desc"): raise Fault(Code.INTERNAL, reason="sql.direction")

        self._order.append(f"{Sql.quote(column)} {direction.upper()}")

        return self

    def group ( self, *columns: str ) -> Self:

        self._group.extend(Sql.quote(column) for column in columns)

        return self

    def raw_group ( self, *expressions: str ) -> Self:

        self._group.extend(expressions)

        return self

    def limit ( self, count: int, offset: int = 0 ) -> Self:

        if count < 0 or offset < 0: raise Fault(Code.INTERNAL, reason="sql.limit")

        self._limit  = count
        self._offset = offset or None

        return self

    def page ( self, page: int, size: int ) -> Self:

        return self.limit(size, (page - 1) * size)

    def set ( self, **pairs: Any ) -> Self:

        for column, value in pairs.items(): self._sets.append(f"{Sql.quote(column)} = {self.bind(value)}")

        return self

    def raw_set ( self, column: str, expression: str, *values: Any ) -> Self:

        rendered = expression

        for value in values: rendered = rendered.replace("?", self.bind(value), 1)

        self._sets.append(f"{Sql.quote(column)} = {rendered}")

        return self

    def values ( self, **pairs: Any ) -> Self:

        if not self._columns: self._columns = [Sql.quote(column) for column in pairs]

        self._values.append([self.bind(pairs[column]) for column in pairs])

        return self

    def rows ( self, columns: Sequence[str], rows: Sequence[Mapping[str, Any]] ) -> Self:

        self._columns = [Sql.quote(column) for column in columns]

        for row in rows: self._values.append([self.bind(row.get(column)) for column in columns])

        return self

    def conflict ( self, *columns: str, update: Sequence[str] = () ) -> Self:

        for name in (*columns, *update): Sql.quote(name)

        self._conflict = (tuple(columns), tuple(update))

        return self

    def returning ( self, *columns: str ) -> Self:

        self._returning = [Sql.quote(column) for column in columns] or ["*"]

        return self

    def lock ( self ) -> Self:

        self._lock = True

        return self

    def count ( self ) -> Self:

        self._columns = ["COUNT(*) AS count"]
        self._order   = []
        self._limit   = None
        self._offset  = None
        self._nearest = None

        return self

    def params ( self ) -> list[Any]:

        return list(self._params)

    def text ( self, dialect: Dialect = POSTGRES ) -> str:

        return self.pair(dialect)[0]

    def pair ( self, dialect: Dialect = POSTGRES ) -> tuple[str, list[Any]]:

        raw  = self._compose_(dialect)
        text = NAME.sub(lambda found: dialect.ident(found.group(1), star=True), raw)
        text = OPER.sub(lambda found: dialect.operator(found.group(1)), text)

        return dialect.render(text, self._params)

    def _compose_ ( self, dialect: Dialect ) -> str:

        where = self._where_(dialect)
        back  = dialect.returning(self._returning) if self._returning else ""

        if self._kind == "select": return self._select_(dialect, where)

        if self._kind == "insert":

            if not self._values: raise Fault(Code.INTERNAL, reason="sql.values")

            rows     = ", ".join(f"({', '.join(row)})" for row in self._values)
            conflict = f" {dialect.upsert(*self._conflict)}" if self._conflict else ""

            return f"INSERT INTO {self._from} ({', '.join(self._columns)}) VALUES {rows}{conflict}{back}"

        if self._kind == "update":

            if not self._sets: raise Fault(Code.INTERNAL, reason="sql.sets")
            if not where: raise Fault(Code.INTERNAL, reason="sql.unbounded")

            return f"{dialect.update_head(self._table)} {', '.join(self._sets)}{where}{back}"

        if not where: raise Fault(Code.INTERNAL, reason="sql.unbounded")

        return f"DELETE FROM {self._from}{where}{back}"

    def _select_ ( self, dialect: Dialect, where: str ) -> str:

        columns = list(self._columns)
        order   = list(self._order)

        if self._nearest is not None:

            distance = dialect.distance(*self._nearest)

            columns.append(f"1 - {distance} AS score")
            order.insert(0, f"{distance} ASC")

        parts = [f"SELECT {', '.join(columns)} FROM {self._from}", *self._joins]

        if where: parts.append(where.strip(" "))
        if self._group: parts.append(f"GROUP BY {', '.join(self._group)}")
        if order: parts.append(f"ORDER BY {', '.join(order)}")
        if self._limit is not None: parts.append(f"LIMIT {self._limit}")
        if self._offset: parts.append(f"OFFSET {self._offset}")
        if self._lock and dialect.can("skip"): parts.append("FOR UPDATE SKIP LOCKED")

        return " ".join(parts)

    def _where_ ( self, dialect: Dialect ) -> str:

        if not self._where: return ""

        clauses = [dialect.search(*clause) if isinstance(clause, tuple) else clause for clause in self._where]

        return f" WHERE {' AND '.join(clauses)}"

    @staticmethod
    def quote ( name: str, star: bool = False ) -> str:

        if star and name == "*": return name
        if not IDENT.match(name): raise Fault(Code.INTERNAL, reason="sql.identifier", errors={ "name": [name[:64]] })

        return f"\x1e{name}\x1e"
