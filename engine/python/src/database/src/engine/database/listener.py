from typing import Any
from .arch import Connection
from .lane import Lane


class Listener:

    __slots__ = ("_channel", "_connection", "_lane", "_relay")

    def __init__ ( self, lane: Lane, connection: Connection, channel: str, relay: Any ) -> None:

        self._lane       = lane
        self._connection = connection
        self._channel    = channel
        self._relay      = relay

    async def close ( self ) -> None:

        try: await self._connection.remove_listener(self._channel, self._relay)
        finally: await self._lane.release(self._connection)
