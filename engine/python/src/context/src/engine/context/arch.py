from collections.abc import Awaitable, Callable, Mapping
from contextvars import Token
from types import MappingProxyType
from typing import Any
import re

type Work   = Callable[[], Awaitable[object] | object]
type Report = Callable[[Exception], object]
type Opened = tuple[Token[Mapping[str, Any]], Token[Any]]

MAPPINGS = (dict, Mapping)
SHARED = ("request_id", "actor", "tenant", "locale", "trace", "traceparent")
EMPTY: Mapping[str, Any] = MappingProxyType({})
LIMIT  = 1024
WIDE   = 256
NAME   = 64
FLAT   = 16

TRACEPARENT = re.compile(r"00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}")
IDENTITY = 64

TRACE_ZERO = "0" * 32
SPAN_ZERO  = "0" * 16
