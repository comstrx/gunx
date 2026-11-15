from collections.abc import Callable
from typing import Any


type Key[T] = Callable[[T], Any]
type Pick[T] = Key[T] | str
type Check[T] = Callable[[T], bool]

MAX_LIMIT = 500
MISSING   = object()
PAIR      = 2
NULLABLE  = frozenset({ "=", "==", "!=", "<>", "in", "not_in" })
