from engine.auth import Actor
from engine.http import Answer

from ..services import Greeter
from ..utils.cycle import Controller

class HelloController(Controller[Greeter]):

    async def world ( self, tone: str, locale: str ) -> Answer:

        return self.ok(await self.service.world(locale, tone))

    async def someone ( self, name: str, locale: str ) -> Answer:

        return self.ok(await self.service.someone(name, locale))

    async def me ( self, principal: Actor, locale: str ) -> Answer:

        return self.ok(await self.service.me(principal, locale))
