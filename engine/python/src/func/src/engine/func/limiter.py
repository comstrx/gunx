
from engine.error import Code, Fault
import asyncio, math, time

class Limiter:

    def __init__ ( self, rate: float, burst: int ) -> None:

        if not 0 < rate < math.inf or not 1 <= burst < math.inf: raise Fault(Code.INTERNAL, reason="func.limiter")

        self._rate   = rate
        self._burst  = burst
        self._tokens = float(burst)
        self._at     = time.monotonic()

    def allow ( self, cost: int = 1 ) -> bool:

        self._refill_(cost)

        if self._tokens < cost: return False

        self._tokens -= cost

        return True

    def wait ( self, cost: int = 1 ) -> float:

        self._refill_(cost)

        return 0.0 if self._tokens >= cost else (cost - self._tokens) / self._rate

    async def acquire ( self, cost: int = 1 ) -> None:

        while not self.allow(cost): await asyncio.sleep(self.wait(cost))

    def describe ( self ) -> dict[str, float]:

        self._refill_()

        return { "rate": self._rate, "burst": self._burst, "tokens": round(self._tokens, 3) }

    def _refill_ ( self, cost: float = 0 ) -> None:

        if not 0 <= cost <= self._burst: raise Fault(Code.INTERNAL, reason="func.limiter")

        now          = time.monotonic()
        self._tokens = min(float(self._burst), self._tokens + (now - self._at) * self._rate)
        self._at     = now
