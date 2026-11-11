from collections.abc import Awaitable, Callable
from typing import Any

from engine.http import Answer, Request

from ..services import Proxy
from ..utils.cycle import Controller

class DoorsController(Controller[Proxy]):

    def table ( self ) -> list[dict[str, Any]]:

        return self.service.table()

    def forward ( self, key: str ) -> Callable[[Request], Awaitable[Answer]]:

        async def handle ( request: Request ) -> Answer:

            return await self.service.forward(request, key)

        return handle

    async def index ( self ) -> Answer:

        return self.ok(await self.service.doors())

    async def gathered ( self ) -> Answer:

        return self.json(await self.service.gathered())
