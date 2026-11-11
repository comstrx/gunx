from collections.abc import Callable, Mapping
from typing import Any

from engine.error import Code, Fault

type Factory = Callable[[BaseException], Fault]
type Reporter = Callable[[Fault, BaseException], object]
type Context = Callable[[], Mapping[str, Any]]

LEVELS   = ("debug", "info", "warning", "error", "critical")
MARK     = "_engine_reported_"
KEYS     = 1024
FIELDS   = 64
WORD     = 64
TRACED   = ("error", "critical")
RESERVED = frozenset({
    "level", "event", "exc_info", "stack_info", "exception", "code", "reason", "kind", "status", "self", "method_name",
})
DEFAULTS = (
    (TimeoutError, Code.TIMEOUT, "timeout", True),
    (ConnectionError, Code.UNAVAILABLE, "connection", True),
    (NotImplementedError, Code.NOT_IMPLEMENTED, "unimplemented", False),
)
