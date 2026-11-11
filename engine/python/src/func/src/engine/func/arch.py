from collections.abc import Awaitable, Callable, Coroutine, Hashable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from enum import Enum
from pathlib import PurePath
from typing import Any
from uuid import UUID
import re

type Work[T] = Callable[[], Awaitable[T]]
type Loader = Callable[[], Any]
type Handler = Callable[..., Coroutine[Any, Any, Any]]
type Target = Callable[..., Any]
type Keyed = Callable[..., Hashable]
type Flush[T, R] = Callable[[list[T]], Awaitable[Sequence[R]]]

OPEN     = "open"
CLOSED   = "closed"
HALF     = "half"
TRIES    = 3
BACKOFF  = 0.2
CEILING  = 30.0
SWITCH   = "ENGINE_NATIVE"
MODES    = ("auto", "native", "pure")

PART     = re.compile(r"[A-Za-z][A-Za-z0-9_]*")
PATH     = 128
LONG     = 256
DOUBLES  = 32
DEPTH    = 16
MISSING  = object()
PLAIN    = frozenset({ str, int, bytes, type(None) })
TAGGED   = (bool, float, str, int, bytes, Decimal, UUID, date, datetime, time, timedelta, Enum, PurePath)
ORDERED  = (list, tuple)
LOOSE    = (set, frozenset)

@dataclass(frozen=True, slots=True)
class Core:

    name   : str
    module : str
    native : Loader
    pure   : Loader
    chosen : str

    def available ( self ) -> bool:

        return self.chosen == "native"

@dataclass(frozen=True, slots=True)
class Info:

    name         : str
    module       : str
    file         : str | None
    line         : int | None
    doc          : str
    params       : tuple[str, ...]
    required     : tuple[str, ...]
    defaults     : Mapping[str, Any]
    returns      : Any
    arity        : int
    is_async     : bool
    is_generator : bool
