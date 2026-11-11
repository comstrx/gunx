from collections.abc import Sequence
from dataclasses import dataclass, replace
from typing import Any

from engine.error import Code, Fault
from engine.socket import Sockets
from .arch import Guard, Upgraded
from .request import Request

@dataclass(frozen=True, slots=True)
class Channel:

    path    : str
    sockets : Sockets
    name    : str = "socket"
    guards  : tuple[Guard, ...] = ()

    @classmethod
    def define ( cls, path: str, sockets: Sockets, name: str = "socket", guards: Sequence[Guard] = () ) -> Channel:

        if not path.startswith("/"): raise Fault(Code.INTERNAL, reason="channel.path", errors={ "path": [path] })

        return cls(path, sockets, name, tuple(guards))

    def guarded ( self, *guards: Guard ) -> Channel:

        return replace(self, guards=(*self.guards, *guards))

    def upgrade ( self ) -> Upgraded:

        sockets = self.sockets

        async def upgraded ( request: Request, connection: Any, **_: Any ) -> None:

            await sockets.serve(connection, request.actor())

        return upgraded

    def describe ( self ) -> dict[str, Any]:

        return { "path": self.path, "name": self.name, "guards": len(self.guards), **self.sockets.describe() }
