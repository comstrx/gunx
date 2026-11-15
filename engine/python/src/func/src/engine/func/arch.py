from collections.abc import Awaitable, Callable, Coroutine, Hashable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from enum import Enum
from pathlib import PurePath
from typing import Any
from uuid import UUID
from engine.error import Code, Fault
import asyncio, math, re

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

@dataclass(slots=True)
class Lease:

    loop  : asyncio.AbstractEventLoop
    lock  : asyncio.Lock = field(default_factory=asyncio.Lock)
    users : int = 0
    valid : bool = True

def count ( value: int, reason: str ) -> int:

    if type(value) is not int or value < 1: raise Fault(Code.INTERNAL, reason=reason)

    return value

def span ( value: float, reason: str, *, infinite: bool = False ) -> float:

    if type(value) not in (int, float) or not value >= 0:

        raise Fault(Code.INTERNAL, reason=reason)

    try: found = float(value)
    except OverflowError as error: raise Fault(Code.INTERNAL, reason=reason) from error

    if not infinite and not math.isfinite(found): raise Fault(Code.INTERNAL, reason=reason)

    return found
