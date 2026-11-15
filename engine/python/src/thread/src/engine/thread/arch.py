from collections.abc import Awaitable, Callable, Mapping
from copy import deepcopy
from dataclasses import dataclass, field
from types import ModuleType
from typing import Any, Literal

from engine.error import Code, Fault
import inspect, os

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
    idempotent: bool = False
    outcomes  : list[Outcome] = field(default_factory=list)
    stopped   : bool = False

@dataclass(frozen=True, slots=True)
class Link:

    module      : Any
    address     : str
    namespace   : str | None
    runtime_env : dict[str, Any]
    remotes     : dict[Callable[..., Any], Any] = field(default_factory=dict)

BUFFER = 2

def bounds ( mode: str, workers: int ) -> None:

    if type(mode) is not str or mode not in POOLS: raise Fault(Code.INTERNAL, reason="thread.mode")
    if type(workers) is not int or not 1 <= workers <= CEILING: raise Fault(Code.INTERNAL, reason="thread.workers")


def seconds ( value: float ) -> float:

    if (type(value) is not float and type(value) is not int) or not value >= 0:

        raise Fault(Code.INTERNAL, reason="thread.seconds")

    return float(value)


async def direct ( handler: Callable[..., Any], item: Any ) -> Any:

    made = handler(item)

    return await made if inspect.isawaitable(made) else made


def space ( value: str | None ) -> str | None:

    if value is not None and (type(value) is not str or not value.strip()):

        raise Fault(Code.INTERNAL, reason="thread.namespace")

    return value


def environment ( value: Mapping[str, Any] | None ) -> dict[str, Any] | None:

    if value is None: return None
    if not isinstance(value, Mapping): raise Fault(Code.INTERNAL, reason="thread.runtime_env")

    try:

        found = dict(value)
        modules = found.get("py_modules", ())
        memo = (
            { id(item): item for item in modules if isinstance(item, ModuleType) }
            if isinstance(modules, (list, tuple)) else {}
        )
        found = deepcopy(found, memo)

    except Exception as error: raise Fault(Code.INTERNAL, reason="thread.runtime_env") from error

    if any(type(key) is not str for key in found): raise Fault(Code.INTERNAL, reason="thread.runtime_env")

    return found
