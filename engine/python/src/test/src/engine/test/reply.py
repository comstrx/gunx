from dataclasses import dataclass, field
from typing import Any, cast

@dataclass(frozen=True, slots=True)
class Reply:

    status  : int
    body    : Any
    headers : dict[str, str] = field(default_factory=dict)

    def data ( self ) -> Any:

        return self._field_("data")

    def code ( self ) -> str | None:

        return cast("str | None", self._field_("code"))

    def message ( self ) -> str | None:

        return cast("str | None", self._field_("message"))

    def reason ( self ) -> str | None:

        return cast("str | None", self._field_("reason"))

    def errors ( self ) -> dict[str, list[str]] | None:

        return cast("dict[str, list[str]] | None", self._field_("errors"))

    def meta ( self ) -> dict[str, Any] | None:

        return cast("dict[str, Any] | None", self._field_("meta"))

    def header ( self, name: str ) -> str | None:

        return self.headers.get(name.lower()) if type(name) is str else None

    def ok ( self ) -> bool:

        return 200 <= self.status < 300

    def _field_ ( self, name: str ) -> Any:

        return self.body.get(name) if isinstance(self.body, dict) else None
