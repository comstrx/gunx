from collections.abc import Awaitable, Callable
from typing import Any, TYPE_CHECKING
import re

from engine.error import Code, Fault

if TYPE_CHECKING:

    from .job import Job

type Handler = Callable[..., Awaitable[Any]]

type Failure = Callable[[Job, Fault], Awaitable[None]]
type Next = Callable[[Job], Awaitable[None]]
type Layer = Callable[[Job, Next], Awaitable[None]]

DEFAULT = "default"
TRIES   = 3
BACKOFF = 5.0
NAME    = 128
MAX_TRIES   = 100
MAX_BACKOFF = 86_400.0
MAX_WAIT    = 366 * 86_400.0
MAX_TIMEOUT = 86_400.0
STAMP       = 64
STAMPED     = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})")

KIND   = "queue"
TOPIC  = "queue"
UNIQUE = 3600.0
CHAIN  = "__chain__"
DEAD   = 1000

def named ( value: object ) -> bool:

    return type(value) is str and 0 < len(value) <= NAME and value.isprintable() and " " not in value

def whole ( value: object, least: int, most: int ) -> bool:

    return type(value) is int and least <= value <= most

def real ( value: object, most: float ) -> bool:

    return isinstance(value, int | float) and type(value) is not bool and 0 <= value <= most

def wrong ( what: str ) -> Fault:

    return Fault(Code.INTERNAL, reason="queue.job", errors={ what: ["is invalid"] })
