from engine.auth import auth
from engine.error import Code, Fault
from engine.http import Answer, Request, Response

from ..services import Avatars
from ..utils.cycle import Controller

class AvatarsController(Controller[Avatars]):

    async def store ( self, request: Request ) -> Answer:

        if not request.body: raise Fault(Code.VALIDATION, reason="avatar.empty", errors={ "file": ["required"] })

        return self.ok(await self.service.store(auth.actor(request).id, request.body))

    async def show ( self, request: Request ) -> Answer:

        data, media = await self.service.show(str(request.params()["user"]))

        return Response.raw(data, media=media, headers={ "Cache-Control": "public, max-age=31536000, immutable" })

    async def destroy ( self, request: Request ) -> Answer:

        await self.service.remove(auth.actor(request).id)

        return self.empty()
