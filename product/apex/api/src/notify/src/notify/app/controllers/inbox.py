from engine.auth import Actor
from engine.http import Answer

from ..services import Inbox
from ..utils.cycle import Controller

class InboxController(Controller[Inbox]):

    async def register ( self, principal: Actor, token: str, platform: str ) -> Answer:

        return self.created(await self.service.register(principal, token, platform))

    async def index ( self, principal: Actor, page: int = 1, limit: int = 20 ) -> Answer:

        rows, total = await self.service.mine(principal, page, limit)

        return self.page(rows, total, page, limit)

    async def read ( self, principal: Actor, notice: str ) -> Answer:

        return self.ok(await self.service.read(principal, notice))
