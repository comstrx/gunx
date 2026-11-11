from typing import Any, ClassVar, Self
from uuid import UUID

from engine.json import json
from engine.validate import Shape, validator
from .arch import Record
from .table import Table

class Model(Shape, kw_only=True):

    table: ClassVar[Table]
    sortable: ClassVar[frozenset[str]] = frozenset({ "created_at", "updated_at", "id" })

    @classmethod
    def from_row ( cls, row: Record ) -> Self:

        kinds  = cls.table.kinds() if hasattr(cls, "table") else {}
        fields = cls.fields()
        plain  = { key: cls._coerce_(kinds.get(key), value) for key, value in row.items() if key in fields }

        return validator.shape(cls, plain)

    def key ( self ) -> Any:

        return getattr(self, self.table.primary())

    @staticmethod
    def _coerce_ ( kind: str | None, value: Any ) -> Any:

        if isinstance(value, UUID): return str(value)
        if kind == "boolean" and isinstance(value, int): return bool(value)
        if kind == "jsonb" and isinstance(value, str | bytes): return json.loads(value)

        return value
