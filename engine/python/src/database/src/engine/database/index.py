from dataclasses import dataclass

from .dialect import Dialect
from .postgres import POSTGRES

@dataclass(frozen=True, slots=True)
class Index:

    columns : tuple[str, ...]
    unique  : bool = False
    where   : str | None = None
    using   : str | None = None

    def name ( self, table: str ) -> str:

        return f"{table}_{'_'.join(self.columns)}_{'key' if self.unique else 'idx'}"

    def ddl ( self, table: str, dialect: Dialect = POSTGRES ) -> str | None:

        return dialect.index(table, self)
