from dataclasses import dataclass
from typing import Any
from uuid import UUID

from engine.auth import Actor, auth
from engine.error import Code, Fault
from engine.http import Channel, Request
from engine.http.arch import Upgraded
from engine.socket import Frame, Socket, Sockets

PATH = "/live"

@dataclass(slots=True)
class Caller:

    fingerprint : str
    actor       : Actor | None = None

@dataclass(frozen=True, slots=True)
class Line(Channel):

    def upgrade ( self ) -> Upgraded:

        sockets = self.sockets

        async def upgraded ( request: Request, connection: Any, **_: Any ) -> None:

            await sockets.serve(connection, Caller(request.fingerprint()))

        return upgraded

class Live:

    def __init__ ( self, sockets: Sockets ) -> None:

        self.sockets = sockets

        sockets.on("auth")(self.enter)
        sockets.authorize(self.gate)

    def channel ( self ) -> Channel:

        return Line.define(PATH, self.sockets, "live")

    async def enter ( self, socket: Socket, frame: Frame ) -> None:

        text   = frame.data.get("token")
        caller = socket.actor

        if type(text) is not str or not isinstance(caller, Caller):

            raise Fault(Code.UNAUTHORIZED, reason="auth.missing")

        claims = await auth.sessions.claims(text, caller.fingerprint)

        if await auth.revoked(claims.id): raise Fault(Code.UNAUTHORIZED, reason="auth.revoked")

        await auth.sessions.verify(claims)

        caller.actor = Actor.from_claims(claims)

    async def gate ( self, socket: Socket, channel: str ) -> bool:

        owner = self.owner(channel)

        if owner is None: return True

        caller = socket.actor

        return isinstance(caller, Caller) and caller.actor is not None and caller.actor.id == owner

    @staticmethod
    def owner ( channel: str ) -> str | None:

        last = channel.rpartition(".")[2]

        try: return str(UUID(last))
        except ValueError: return None
