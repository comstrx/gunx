from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any
from .arch import Hook, Submit
from .outcome import Outcome

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
