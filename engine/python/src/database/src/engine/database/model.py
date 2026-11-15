from typing import Any, ClassVar, Self
from uuid import UUID

from engine.json import json
from engine.validate import Shape, validator
from .arch import Record
from .table import Table

class Model(Shape, kw_only=True):

    table: ClassVar[Table]
    _columns: ClassVar[tuple[Table | None, dict[str, str | None]] | None] = None
    sortable: ClassVar[frozenset[str]] = frozenset({ "created_at", "updated_at", "id" })

    @classmethod
    def from_row ( cls, row: Record ) -> Self:

        table = getattr(cls, "table", None)
        held  = cls.__dict__.get("_columns")

        if held is None or held[0] is not table:

            kinds = table.kinds() if table is not None else {}
            held  = (table, { key: kinds.get(key) for key in cls.fields() })

            cls._columns = held

        columns = held[1]
        plain   = { key: cls._coerce_(columns[key], value) for key, value in row.items() if key in columns }

        return validator.shape(cls, plain)

    def key ( self ) -> Any:

        return getattr(self, self.table.primary())

    @staticmethod
    def _coerce_ ( kind: str | None, value: Any ) -> Any:

        if isinstance(value, UUID): return str(value)
        if kind == "boolean" and isinstance(value, int): return bool(value)
        if kind == "jsonb" and isinstance(value, str | bytes): return json.loads(value)

        return value
