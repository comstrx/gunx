from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from engine.log import log
from .arch import IDLE, MAX_FRAME, SEND_WAIT
from .frame import Frame
import asyncio

@dataclass(slots=True)
class Socket:

    id         : str
    connection : Any
    actor      : Any
    channels   : set[str] = field(default_factory=set)
    sent       : int = 0
    received   : int = 0
    closed     : bool = False
    lock       : asyncio.Lock = field(default_factory=asyncio.Lock)
    window     : float = 0.0
    burst      : int = 0

    def allow ( self, limit: int, span: float, now: float ) -> bool:

        if limit <= 0: return True

        if now - self.window >= span:

            self.window = now
            self.burst  = 0

        self.burst += 1

        return self.burst <= limit

    async def send (
        self, event: str, data: Mapping[str, Any] | None = None, channel: str | None = None, id_: str | None = None,
    ) -> None:

        if self.closed: return

        frame = Frame(event=event, channel=channel, data=dict(data or {}), id=id_)

        try:

            async with asyncio.timeout(SEND_WAIT), self.lock: await self.connection.send(frame.encode().decode())

        except Exception as error:

            self.closed = True

            log.debug("socket.send_failed", socket=self.id, kind=type(error).__name__)

            return

        self.sent += 1

    async def receive ( self, idle: float = IDLE, limit: int = MAX_FRAME ) -> Frame | None:

        try:

            async with asyncio.timeout(idle): raw = await self.connection.recv()

        except TimeoutError: return None
        except Exception: return None

        if raw is None: return None

        self.received += 1

        return Frame.decode(raw, limit)

    async def close ( self, code: int = 1000, reason: str = "" ) -> None:

        if self.closed: return

        self.closed = True

        try: await self.connection.close(code, reason)
        except Exception: log.debug("socket.close_failed", socket=self.id)

    def describe ( self ) -> dict[str, Any]:

        return {
            "id": self.id, "actor": self.actor, "channels": sorted(self.channels), "sent": self.sent,
            "received": self.received,
        }
