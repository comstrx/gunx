from collections.abc import AsyncIterator, Callable
from typing import Any

from engine.error import Code, Fault

class Channel:

    def __init__ ( self, url: str, wait: float = 2.0 ) -> None:

        import redis.asyncio as aioredis, redis.exceptions as failures

        self._client: Any = aioredis.Redis.from_url(url, socket_timeout=wait, socket_connect_timeout=wait, protocol=3)
        self._failures: tuple[type[Exception], ...] = (failures.RedisError,)

    async def publish ( self, topic: str, payload: bytes ) -> int:

        try: return int(await self._client.publish(topic, payload))
        except self._failures as error: raise self._fault_() from error

    async def listen ( self, topic: str, running: Callable[[], bool] ) -> AsyncIterator[bytes]:

        subscriber = self._client.pubsub(ignore_subscribe_messages=True)

        try:

            await subscriber.subscribe(topic)

            while running():

                message = await subscriber.get_message(timeout=1.0)

                if message is not None and message.get("type") == "message": yield message["data"]

        except self._failures as error: raise self._fault_() from error
        finally: await subscriber.aclose()

    async def close ( self ) -> None:

        await self._client.aclose()

    @staticmethod
    def _fault_ () -> Fault:

        return Fault(Code.UNAVAILABLE, reason="cache.channel", unknown=True)
