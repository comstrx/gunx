from typing import Any

from engine.auth import Actor
from engine.translate import translate

from ..enums import Tone
from ..repositories import Greetings
from ..resources import GreetingResource
from ..utils.cycle import Service

class Greeter(Service[Greetings]):

    resource = GreetingResource

    async def world ( self, locale: str, tone: str ) -> dict[str, Any]:

        return self.resource.one(await self.rows.match(locale, tone))

    async def someone ( self, name: str, locale: str ) -> dict[str, Any]:

        text = translate.text("hello.name", locale, name=name)

        return self.resource.one(self.rows.compose(locale, text, Tone.WARM))

    async def me ( self, actor: Actor, locale: str ) -> dict[str, Any]:

        return { **(await self.someone(actor.id, locale)), "actor": actor.dump() }
