from engine.event import Event

from ..services import Inbox

class SessionListener:

    def __init__ ( self, inbox: Inbox ) -> None:

        self.inbox = inbox

    async def started ( self, event: Event ) -> None:

        who = str(event.data.get("who") or "friend")

        await self.inbox.welcome(str(event.data["user"]), event.data.get("tenant"), who)
