from typing import ClassVar

from engine.error import Code, Fault
from .arch import Arm
import aiormq, asyncio, contextlib

class Link:

    failures: ClassVar[tuple[type[BaseException], ...]] = (
        aiormq.exceptions.AMQPError, aiormq.exceptions.ChannelInvalidStateError, OSError, TimeoutError,
    )

    def __init__ ( self, url: str, wait: float, arm: Arm, confirms: bool = False ) -> None:

        self._url      = url
        self._wait     = wait
        self._arm      = arm
        self._confirms = confirms
        self._epoch    = 0
        self._connection: aiormq.abc.AbstractConnection | None = None
        self._channel: aiormq.abc.AbstractChannel | None = None
        self._lock     = asyncio.Lock()

    def epoch ( self ) -> int:

        return self._epoch

    def live ( self, epoch: int ) -> aiormq.abc.AbstractChannel | None:

        channel = self._channel

        return channel if channel is not None and epoch == self._epoch and not channel.is_closed else None

    async def channel ( self ) -> aiormq.abc.AbstractChannel:

        async with self._lock:

            found = self._channel

            if found is not None and not found.is_closed: return found

            try:

                connection = await self._connect_()
                channel    = await connection.channel(publisher_confirms=self._confirms, timeout=self._wait)

                await self._arm(channel)

            except self.failures as error:

                await self._drop_()

                raise self._down_() from error

            self._channel = channel
            self._epoch  += 1

            return channel

    async def side ( self ) -> aiormq.abc.AbstractChannel:

        await self.channel()

        connection = self._connection

        if connection is None: raise self._down_()

        try: return await connection.channel(publisher_confirms=False, timeout=self._wait)
        except self.failures as error: raise self._down_() from error

    async def close ( self ) -> None:

        async with self._lock: await self._drop_()

    async def _connect_ ( self ) -> aiormq.abc.AbstractConnection:

        found = self._connection

        if found is not None and not found.is_closed: return found

        made = await asyncio.wait_for(aiormq.connect(self._url), self._wait)

        self._connection = made

        return made

    async def _drop_ ( self ) -> None:

        connection, self._connection, self._channel = self._connection, None, None

        if connection is not None and not connection.is_closed:

            with contextlib.suppress(*self.failures): await asyncio.wait_for(connection.close(), self._wait)

    def _down_ ( self ) -> Fault:

        return Fault(Code.UNAVAILABLE, reason="broker.connect", unknown=True)
