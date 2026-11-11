from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from engine.net import Egress

type Work = Callable[[], Any]
type AsyncWork = Callable[[], Awaitable[Any]]

DATABASE  = "postgresql://engine:engine@127.0.0.1:5432/engine_test"
REDIS     = "redis://127.0.0.1:6379/14"
AMQP      = "amqp://guest:guest@127.0.0.1:5672/"
LOCAL     = Egress(allow_private=True, ports=frozenset())
BASES     = ("http://", "https://")
QUANTILES = (0.5, 0.95, 0.99)
ROUNDS    = 10_000_000
SHARE     = 20
WARM      = 20
WORD      = 128
SHOWN     = 512

@dataclass(frozen=True, slots=True)
class Sample:

    name   : str
    rounds : int
    p50    : float
    p95    : float
    p99    : float
    low    : float
    high   : float

    def line ( self ) -> str:

        head = f"{self.name}  p50={self.p50:.2f}µs  p95={self.p95:.2f}µs  p99={self.p99:.2f}µs"

        return f"{head}  min={self.low:.2f}µs  max={self.high:.2f}µs  n={self.rounds}"

    def dump ( self ) -> dict[str, Any]:

        return {
            "name": self.name, "rounds": self.rounds, "p50": self.p50, "p95": self.p95, "p99": self.p99,
            "low": self.low, "high": self.high,
        }
