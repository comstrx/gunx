from engine.auth import Actor
from engine.http import Answer

from ..services import Sessions
from ..utils.cycle import Controller

class SessionsController(Controller[Sessions]):

    async def code ( self, email: str ) -> Answer:

        await self.service.request_code(email)

        return self.accepted()

    async def store ( self, email: str, code: str, fingerprint: str, tenant: str | None = None ) -> Answer:

        return self.created(await self.service.start(email, code, fingerprint, tenant))

    async def refresh ( self, refresh: str, fingerprint: str ) -> Answer:

        return self.ok(await self.service.refresh(refresh, fingerprint))

    async def destroy ( self, bearer: str | None ) -> Answer:

        if bearer: await self.service.end(bearer)

        return self.empty()

    async def me ( self, principal: Actor ) -> Answer:

        return self.ok(await self.service.me(principal))
