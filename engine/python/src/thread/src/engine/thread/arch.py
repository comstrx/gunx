from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Literal

import os

type Mode = Literal["async", "thread", "process", "interpreter", "ray", "remote"]
type Hook = Callable[[int, Any], Awaitable[None] | None]
type Submit = Callable[[Callable[..., Any], Any], Awaitable[Any]]

type Job[T] = Callable[..., T]

MODES    = ("async", "thread", "process", "interpreter", "ray", "remote")
SCOPES   = ("async", "thread", "process", "interpreter", "remote")
ISOLATED = ("process", "interpreter")
POOLS    = ("thread", *ISOLATED)
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
class Link:

    module      : Any
    address     : str
    namespace   : str | None
    runtime_env : dict[str, Any]
    remotes     : dict[Callable[..., Any], Any] = field(default_factory=dict)

BUFFER = 2
