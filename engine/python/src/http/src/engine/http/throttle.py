from dataclasses import dataclass

from engine.cache import Hit, cache
from engine.error import Code, Fault
from engine.parse import parse
from .arch import KEYS, THROTTLES, ThrottleKey
from .request import Request
import math

@dataclass(frozen=True, slots=True)
class Throttle:

    limit  : int
    window : float
    by     : ThrottleKey = "ip"
    mode   : str = "fixed"

    def __post_init__ ( self ) -> None:

        if type(self.limit) is not int or self.limit < 1:

            raise Fault(Code.INTERNAL, reason="throttle.policy")

        if type(self.window) not in (int, float) or self.window <= 0:

            raise Fault(Code.INTERNAL, reason="throttle.policy")

        if not callable(self.by) and self.by not in tuple(KEYS):

            raise Fault(Code.INTERNAL, reason="throttle.policy")

        if type(self.mode) is not str or self.mode not in THROTTLES:

            raise Fault(Code.INTERNAL, reason="throttle.policy")

        try:

            finite = math.isfinite(self.window)
            rate   = self.limit / self.window

        except OverflowError as error: raise Fault(Code.INTERNAL, reason="throttle.policy") from error

        if not finite or not math.isfinite(rate) or rate <= 0:

            raise Fault(Code.INTERNAL, reason="throttle.policy")

    @classmethod
    def parse ( cls, text: str ) -> Throttle:

        try:

            count, _, rest = text.partition("/")
            window, _, by  = rest.partition(":")
            made           = cls(parse.integer(count, 1), parse.duration(window or "1m"), by or "ip")

        except (Fault, AttributeError) as error:

            raise Fault(Code.INTERNAL, reason="throttle.policy", errors={ "policy": [str(text)[:64]] }) from error

        if made.by not in KEYS or made.window <= 0:

            raise Fault(Code.INTERNAL, reason="throttle.policy", errors={ "policy": [text] })

        return made

    def key ( self, request: Request, scope: str ) -> str:

        if callable(self.by):

            value = self.by(request)

            if type(value) is not str or not value: raise Fault(Code.INTERNAL, reason="throttle.key")

            return f"{scope}:key:{value}"

        if self.by == "actor" and request.actor() is not None: return f"{scope}:actor:{request.actor()}"

        return f"{scope}:ip:{request.client()}"

    async def hit ( self, request: Request, scope: str ) -> Hit:

        key = self.key(request, scope)

        if self.mode == "bucket": return await cache.bucket(key, self.limit / self.window, self.limit)

        return await cache.hit(key, self.limit, self.window)

    async def check ( self, request: Request, scope: str ) -> None:

        found = await self.hit(request, scope)

        previous = getattr(request.ctx, "throttle", None)

        replace = not found.allowed or previous is None

        if previous is not None and found.allowed:

            replace = found.remaining / self.limit < previous.remaining / request.ctx.ceiling

        if replace:

            request.ctx.throttle = found
            request.ctx.ceiling  = self.limit

        if not found.allowed:

            raise Fault(Code.TOO_MANY_REQUESTS, reason="http.throttled", retry_after=found.retry_after())
