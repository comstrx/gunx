
from engine.error import Code, Fault
from engine.log import log
from .arch import CLOSED, HALF, OPEN, Work
import math, time

class Breaker:

    def __init__ ( self, name: str, threshold: int = 5, cooldown: float = 30.0 ) -> None:

        if threshold < 1 or not 0 <= cooldown < math.inf: raise Fault(Code.INTERNAL, reason="func.breaker")

        self.name       = name
        self._threshold = threshold
        self._cooldown  = cooldown
        self._failures  = 0
        self._opened    = 0.0
        self._state     = CLOSED
        self._probing   = False

    def state ( self ) -> str:

        if self._state == OPEN and time.monotonic() - self._opened >= self._cooldown: self._state = HALF

        return self._state

    def allows ( self ) -> bool:

        return self.state() != OPEN

    def succeed ( self ) -> None:

        self._failures = 0
        self._state    = CLOSED

    def fail ( self ) -> None:

        self._failures += 1

        if self._state == HALF or self._failures >= self._threshold:

            self._state  = OPEN
            self._opened = time.monotonic()

            log.warning("breaker.open", name=self.name, failures=self._failures)

    async def call [T] ( self, work: Work[T] ) -> T:

        probe = self.state() == HALF

        if self._state == OPEN or (probe and self._probing):

            raise Fault(Code.UNAVAILABLE, reason=f"breaker.{self.name}", retry_after=self.remaining())

        if probe: self._probing = True

        try:

            result = await work()

        except Fault as fault:

            if fault.server() or fault.retryable(): self.fail()

            raise

        finally:

            if probe: self._probing = False

        self.succeed()

        return result

    def remaining ( self ) -> float:

        return max(0.0, self._cooldown - (time.monotonic() - self._opened))

    def reset ( self ) -> None:

        self.succeed()

    def describe ( self ) -> dict[str, object]:

        return { "name": self.name, "state": self.state(), "failures": self._failures }
