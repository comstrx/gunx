from collections.abc import Awaitable, Callable, Mapping
from contextvars import Token
from types import MappingProxyType
from typing import Any

type Work   = Callable[[], Awaitable[object] | object]
type Report = Callable[[Exception], object]
type Opened = tuple[Token[Mapping[str, Any]], Token[Any]]

SHARED = ("request_id", "actor", "tenant", "locale", "trace")
EMPTY: Mapping[str, Any] = MappingProxyType({})
NUMBER = (int, float)
SCALAR = (str, int, float)
LIMIT  = 1024
WIDE   = 256
NAME   = 64
FLAT   = 16
