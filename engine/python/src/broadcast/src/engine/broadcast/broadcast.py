from collections.abc import Mapping
from typing import Any

from engine.cache import Channel
from engine.error import Code, Fault
from engine.json import json
from engine.log import log
from engine.rand import rand
from engine.socket import Hub, sockets
from engine.thread import thread
from .arch import named, PAYLOAD, TOPIC, unset
import asyncio

class Broadcast:

    def __init__ ( self ) -> None:

        self._hub: Hub = sockets.hub
        self._client: Channel | None = None
        self._topic   = TOPIC
        self._worker  = rand.hex(4)
        self._task: Any = None
        self._running = False
        self._sent    = 0
        self._relayed = 0
        self._dropped = 0

    def setup ( self, hub: Hub | None = None, url: str | None = None, topic: str = TOPIC ) -> None:

        held: object = hub

        if held is not None and not isinstance(held, Hub): raise unset("hub")
        if not named(topic) or " " in topic: raise unset("topic")
        if url is not None and (type(url) is not str or not url.startswith(("redis://", "rediss://"))):

            raise unset("url")

        self._hub   = hub or sockets.hub
        self._topic = topic

        if url: self._client = Channel(url)

    def ready ( self ) -> bool:

        return self._client is not None

    async def publish ( self, channel: str, event: str, data: Mapping[str, Any] | None = None ) -> int:

        if not named(channel): raise self._refuse_("channel")
        if not named(event): raise self._refuse_("event")
        if data is not None and not isinstance(data, Mapping): raise self._refuse_("data")

        facts     = dict(data or {})
        delivered = await self._hub.emit(channel, event, facts)

        self._sent += 1

        if self._client is not None:

            payload = json.encode({ "channel": channel, "event": event, "data": facts, "worker": self._worker })

            if len(payload) > PAYLOAD: raise self._refuse_("size")

            try: await self._client.publish(self._topic, payload)
            except Fault as error:

                raise Fault(Code.UNAVAILABLE, reason="broadcast.redis", unknown=True) from error

        return delivered

    async def to ( self, actor: Any, event: str, data: Mapping[str, Any] | None = None ) -> int:

        if not named(event): raise self._refuse_("event")
        if data is not None and not isinstance(data, Mapping): raise self._refuse_("data")

        return await self._hub.send_to(actor, event, dict(data or {}))

    def start ( self ) -> None:

        if self._client is None or self._running: return

        self._running = True
        self._task    = thread.spawn(self._listen_(), "broadcast")

    async def stop ( self ) -> None:

        self._running = False

        task, self._task = self._task, None

        if task is None: return

        task.cancel()

        await asyncio.gather(task, return_exceptions=True)

    async def close ( self ) -> None:

        await self.stop()

        if self._client is not None: await self._client.close()

        self._client = None

    def stats ( self ) -> dict[str, int]:

        return { "sent": self._sent, "relayed": self._relayed, "dropped": self._dropped }

    def describe ( self ) -> dict[str, Any]:

        facts = { "topic": self._topic, "worker": self._worker, "redis": self._client is not None }

        return { **facts, **self.stats(), **self._hub.describe() }

    async def relay ( self, raw: bytes | str ) -> bool:

        if len(raw) > PAYLOAD: return self._drop_("size")

        try: payload = json.decode(raw)
        except Fault: return self._drop_("json")

        if not isinstance(payload, dict): return self._drop_("shape")
        if payload.get("worker") == self._worker: return False

        channel, event, data = payload.get("channel"), payload.get("event"), payload.get("data")

        if not named(channel) or not named(event) or (data is not None and not isinstance(data, dict)):

            return self._drop_("shape")

        await self._hub.emit(channel, event, data or {})

        self._relayed += 1

        return True

    async def _listen_ ( self ) -> None:

        client = self._client

        while self._running and client is not None:

            try:

                async for raw in client.listen(self._topic, lambda: self._running): await self.relay(raw)

            except asyncio.CancelledError: return
            except Fault as error: log.warning("broadcast.listen", reason=error.reason)
            except Exception: log.exception("broadcast.listen")
            else: return

            if self._running: await thread.sleep(1.0)

    def _drop_ ( self, what: str ) -> bool:

        self._dropped += 1

        log.warning("broadcast.dropped", what=what)

        return False

    @staticmethod
    def _refuse_ ( what: str ) -> Fault:

        return Fault(Code.VALIDATION, reason=f"broadcast.{what}")
