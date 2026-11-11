from collections.abc import Sequence
from dataclasses import dataclass

from engine.error import Code, Fault
from .arch import EMPTY, KINDS, NOW, UUID
from .dialect import Dialect
from .postgres import POSTGRES
from .sql import Sql

@dataclass(frozen=True, slots=True)
class Column:

    name     : str
    kind     : str
    nullable : bool = False
    default  : str | None = None
    unique   : bool = False
    primary  : bool = False
    check    : str | None = None
    foreign  : str | None = None
    on_delete: str = "RESTRICT"
    length   : int | None = None
    renamed  : str | None = None
    generated: str | None = None

    def __post_init__ ( self ) -> None:

        Sql.quote(self.name)

        if self.kind not in KINDS: raise Fault(Code.INTERNAL, reason="table.kind", errors={ self.name: [self.kind] })

    def ddl ( self, dialect: Dialect = POSTGRES ) -> str:

        return dialect.column(self)

    def volatile ( self ) -> bool:

        return self.default is not None and self.default.endswith("()") and self.default != NOW

    @classmethod
    def id ( cls ) -> Column:

        return cls("id", "uuid", primary=True, default=UUID)

    @classmethod
    def text (
        cls, name: str, nullable: bool = False, unique: bool = False, default: str | None = None,
        check: str | None = None, length: int | None = None,
    ) -> Column:

        return cls(name, "text", nullable, default, unique, check=check, length=length)

    @classmethod
    def integer (
        cls, name: str, nullable: bool = False, default: str | None = None, big: bool = False, check: str | None = None,
    ) -> Column:

        return cls(name, "bigint" if big else "integer", nullable, default, check=check)

    @classmethod
    def boolean ( cls, name: str, default: bool = False ) -> Column:

        return cls(name, "boolean", default="true" if default else "false")

    @classmethod
    def money ( cls, name: str, nullable: bool = False ) -> Column:

        return cls(name, "bigint", nullable, "0" if not nullable else None, check=f"{name} >= 0")

    @classmethod
    def numeric ( cls, name: str, nullable: bool = False, precision: int = 18 ) -> Column:

        return cls(name, "numeric", nullable, None if nullable else "0", length=precision)

    @classmethod
    def timestamp ( cls, name: str, nullable: bool = False, now: bool = False ) -> Column:

        return cls(name, "timestamp", nullable, NOW if now else None)

    @classmethod
    def date ( cls, name: str, nullable: bool = False ) -> Column:

        return cls(name, "date", nullable)

    @classmethod
    def jsonb ( cls, name: str, nullable: bool = False ) -> Column:

        return cls(name, "jsonb", nullable, None if nullable else EMPTY)

    @classmethod
    def bytes ( cls, name: str, nullable: bool = False ) -> Column:

        return cls(name, "bytes", nullable)

    @classmethod
    def enum ( cls, name: str, values: Sequence[str], default: str | None = None ) -> Column:

        listed = ", ".join(f"'{value}'" for value in values)

        return cls(name, "text", default=f"'{default}'" if default else None, check=f"{name} IN ({listed})")

    @classmethod
    def reference ( cls, name: str, table: str, nullable: bool = False, on_delete: str = "RESTRICT" ) -> Column:

        return cls(name, "uuid", nullable, foreign=f"{table}.id", on_delete=on_delete)

    @classmethod
    def vector ( cls, name: str, dimensions: int ) -> Column:

        return cls(name, "vector", nullable=True, length=dimensions)

    @classmethod
    def tsvector ( cls, name: str, expression: str ) -> Column:

        return cls(name, "tsvector", nullable=True, generated=expression)
