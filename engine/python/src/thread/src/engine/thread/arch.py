from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Literal

from engine.error import Fault
import os

type Mode = Literal["async", "thread", "process", "interpreter", "ray"]
type Hook = Callable[[int, Any], Awaitable[None] | None]
type Submit = Callable[[Callable[..., Any], Any], Awaitable[Any]]

type Job[T] = Callable[..., T]

MODES    = ("async", "thread", "process", "interpreter", "ray")
ISOLATED = ("process", "interpreter")
CORES    = max(2, os.process_cpu_count() or 2)

WORKERS  = 32
CEILING  = 1024
RETRIES  = 100
RECYCLE  = 1000
REMOTES  = 256
LIMIT    = 8
WORD     = 120
GRACE    = 5.0
DRAIN    = 30.0

@dataclass(frozen=True, slots=True)
class Outcome:

    index  : int
    value  : Any = None
    error  : Fault | None = None
    ms     : float = 0.0

    def ok ( self ) -> bool:

        return self.error is None

@dataclass(slots=True)
class Flight:

    submit    : Submit
    handler   : Callable[..., Any]
    wait      : float | None
    tries     : int
    fail_fast : bool
    on_result : Hook | None
    on_error  : Hook | None
    outcomes  : list[Outcome] = field(default_factory=list)
    stopped   : bool = False
