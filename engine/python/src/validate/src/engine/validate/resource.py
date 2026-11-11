from collections.abc import Iterable
from typing import Any, ClassVar

from .shape import Shape

class Resource[S: Shape]:

    fields: ClassVar[tuple[str, ...]] = ()

    @classmethod
    def dump ( cls, item: S ) -> dict[str, Any]:

        found = item.dump()

        return { name: found[name] for name in cls.fields if name in found } if cls.fields else found

    @classmethod
    def one ( cls, item: S ) -> dict[str, Any]:

        return cls.dump(item)

    @classmethod
    def many ( cls, items: Iterable[S] ) -> list[dict[str, Any]]:

        return [cls.dump(item) for item in items]
