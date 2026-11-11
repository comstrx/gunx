from collections.abc import Iterator, Mapping

from .code import Code
from .fault import Fault

class Bag:

    __slots__ = ("_items",)

    def __init__ ( self, items: Mapping[str, list[str]] | None = None ) -> None:

        self._items: dict[str, list[str]] = { field: list(messages) for field, messages in (items or {}).items() }

    def add ( self, field: str, message: str ) -> Bag:

        self._items.setdefault(field, []).append(message)

        return self

    def extend ( self, other: Mapping[str, list[str]] ) -> Bag:

        for field, messages in other.items(): self._items.setdefault(field, []).extend(messages)

        return self

    def has ( self, field: str | None = None ) -> bool:

        return bool(self._items) if field is None else field in self._items

    def first ( self, field: str ) -> str | None:

        found = self._items.get(field)

        return found[0] if found else None

    def fields ( self ) -> tuple[str, ...]:

        return tuple(self._items)

    def count ( self ) -> int:

        return sum(len(messages) for messages in self._items.values())

    def dump ( self ) -> dict[str, list[str]]:

        return { field: list(messages) for field, messages in self._items.items() }

    def text ( self ) -> str:

        return "; ".join(f"{field}: {', '.join(messages)}" for field, messages in self._items.items())

    def fault ( self, code: Code = Code.VALIDATION, reason: str = "validation" ) -> Fault:

        return Fault(code, self.text() or None, reason, self.dump())

    def raise_if_any ( self, reason: str = "validation" ) -> None:

        if self._items: raise Fault(Code.VALIDATION, reason=reason, errors=self.dump())

    def __iter__ ( self ) -> Iterator[tuple[str, list[str]]]:

        return iter(self.dump().items())

    def __len__ ( self ) -> int:

        return len(self._items)

    def __bool__ ( self ) -> bool:

        return bool(self._items)
