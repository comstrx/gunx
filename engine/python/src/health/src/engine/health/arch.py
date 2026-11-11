from collections.abc import Awaitable, Callable
from dataclasses import dataclass
import re

type Check = Callable[[], Awaitable[bool] | bool]

NAME     = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}")
RESERVED = frozenset({ "status", "uptime", "checks" })
PROBES   = 256
FACTS    = 64
WEIGHT   = 4096
WORD     = 64
LIMIT    = 60.0
UNREADY  = "unready"

@dataclass(frozen=True, slots=True)
class Probe:

    name     : str
    check    : Check
    critical : bool = True
    timeout  : float = 2.0
