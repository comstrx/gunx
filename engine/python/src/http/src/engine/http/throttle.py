from dataclasses import dataclass

from engine.cache import Hit, cache
from engine.error import Code, Fault
from engine.parse import parse
from .arch import KEYS
from .request import Request

@dataclass(frozen=True, slots=True)
class Throttle:

    limit  : int
    window : float
    by     : str = "ip"

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

        if self.by == "actor" and request.actor() is not None: return f"{scope}:actor:{request.actor()}"

        return f"{scope}:ip:{request.client()}"

    async def hit ( self, request: Request, scope: str ) -> Hit:

        return await cache.hit(self.key(request, scope), self.limit, self.window)

    async def check ( self, request: Request, scope: str ) -> None:

        found = await self.hit(request, scope)

        request.ctx.throttle = found
        request.ctx.ceiling  = self.limit

        if not found.allowed:

            raise Fault(Code.TOO_MANY_REQUESTS, reason="http.throttled", retry_after=found.retry_after())
