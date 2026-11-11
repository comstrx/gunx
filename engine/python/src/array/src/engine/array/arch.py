from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from engine.string import string
import math, operator as ops

type Key[T] = Callable[[T], Any]
type Pick[T] = Key[T] | str
type Check[T] = Callable[[T], bool]

MAX_LIMIT = 500
MISSING   = object()
TESTS: dict[str, Callable[[Any, Any], bool]] = {
    "="        : ops.eq,
    "=="       : ops.eq,
    "!="       : ops.ne,
    "<>"       : ops.ne,
    ">"        : ops.gt,
    ">="       : ops.ge,
    "<"        : ops.lt,
    "<="       : ops.le,
    "in"       : lambda found, value: found in value,
    "not_in"   : lambda found, value: found not in value,
    "between"  : lambda found, value: bool(value[0] <= found <= value[1]),
    "like"     : lambda found, value: string.like(str(found), str(value)),
    "contains" : lambda found, value: str(value) in str(found),
    "starts"   : lambda found, value: str(found).startswith(str(value)),
    "ends"     : lambda found, value: str(found).endswith(str(value)),
}
PAIR      = 2
NULLABLE  = frozenset({ "=", "==", "!=", "<>", "in", "not_in" })

@dataclass(frozen=True, slots=True)
class Page:

    page  : int
    limit : int
    total : int

    def pages ( self ) -> int:

        return max(1, math.ceil(self.total / self.limit)) if self.limit else 1

    def offset ( self ) -> int:

        return (self.page - 1) * self.limit

    def dump ( self ) -> dict[str, int]:

        return { "page": self.page, "limit": self.limit, "total": self.total, "pages": self.pages() }
