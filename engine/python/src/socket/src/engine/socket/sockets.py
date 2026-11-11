from collections.abc import Callable
from typing import Any

from engine.error import Code, Fault
from engine.log import log
from engine.rand import rand
from .arch import CHANNELS, Gate, Handler, IDLE, MAX_FRAME, roomed, timed, whole
from .frame import Frame
from .hub import Hub
from .socket import Socket
import asyncio

class Sockets:

    def __init__ ( self ) -> None:

        self.hub      = Hub()
        self._limit   = MAX_FRAME
        self._idle    = IDLE
        self._rate    = 0
        self._span    = 1.0
        self._rooms   = CHANNELS
        self._gate: Gate | None = None
        self._handlers: dict[str, Handler] = {}
        self._refused = 0

    def setup (
        self, capacity: int = 10000, limit: int = MAX_FRAME, idle: float = IDLE, rate: int = 0, span: float = 1.0,
        channels: int = CHANNELS, history: int = 0,
    ) -> None:

        self.hub    = Hub(capacity, history)
        self._limit = whole(limit, "limit")
        self._idle  = timed(idle, "idle")
        self._rate  = whole(rate, "rate", 0)
        self._span  = timed(span, "span")
        self._rooms = whole(channels, "channels")

    def authorize ( self, gate: Gate ) -> None:

        if not callable(gate): raise Fault(Code.INTERNAL, reason="socket.settings", errors={ "setting": ["gate"] })

        self._gate = gate

    def allow ( self, socket: Socket ) -> bool:

        allowed = socket.allow(self._rate, self._span, asyncio.get_running_loop().time())

        if not allowed: self._refused += 1

        return allowed

    def on ( self, event: str ) -> Callable[[Handler], Handler]:

        def register ( handler: Handler ) -> Handler:

            if not roomed(event) or not callable(handler): raise Fault(Code.INTERNAL, reason="socket.handler")

            self._handlers[event] = handler

            return handler

        return register

    def events ( self ) -> tuple[str, ...]:

        return tuple(sorted(self._handlers))

    async def serve ( self, connection: Any, actor: Any = None ) -> None:

        socket = Socket(rand.hex(8), connection, actor)

        self.hub.add(socket)

        await socket.send("connected", { "id": socket.id })

        try:

            while not socket.closed:

                frame = await socket.receive(self._idle, self._limit)

                if frame is None: break

                if not self.allow(socket):

                    await self.refuse(socket, frame, "too_many_requests", "socket.rate")

                    continue

                await self.dispatch(socket, frame)

        except Fault as fault:

            await socket.send("error", { "code": fault.code.value, "reason": fault.reason })
            await socket.close(1008, fault.reason or "refused")

        finally: self.hub.remove(socket)

    async def dispatch ( self, socket: Socket, frame: Frame ) -> None:

        builtin = self._builtin_(frame)

        if builtin is not None:

            await builtin(socket, frame)

            return

        handler = self._handlers.get(frame.event)

        if handler is None:

            await socket.send("error", { "code": "not_found", "reason": "socket.event" }, frame.channel, frame.id)

            return

        try: await handler(socket, frame)
        except Fault as fault:

            await socket.send("error", { "code": fault.code.value, "reason": fault.reason }, frame.channel, frame.id)

        except Exception:

            log.exception("socket.crashed", name=frame.event)

            await socket.send("error", { "code": "internal", "reason": None }, frame.channel, frame.id)

    def _builtin_ ( self, frame: Frame ) -> Handler | None:

        table: dict[str, Handler] = { "ping": self._ping_, "whisper": self._whisper_ }
        roomed: dict[str, Handler] = { "join": self._join_, "leave": self._leave_, "presence": self._presence_ }

        if frame.event in roomed and frame.channel: return roomed[frame.event]

        return table.get(frame.event)

    async def _join_ ( self, socket: Socket, frame: Frame ) -> None:

        channel = frame.channel or ""

        if not roomed(channel):

            await self.refuse(socket, frame, "validation", "socket.channel")

            return

        if len(socket.channels) >= self._rooms and channel not in socket.channels:

            await self.refuse(socket, frame, "too_many_requests", "socket.channels")

            return

        if self._gate is not None and not await self._gated_(socket, channel):

            await self.refuse(socket, frame, "forbidden", "socket.forbidden")

            return

        self.hub.join(socket, channel)

        await socket.send("joined", { "channel": channel }, channel, frame.id)
        await self.hub.replay(socket, channel)

    async def _leave_ ( self, socket: Socket, frame: Frame ) -> None:

        channel = frame.channel or ""

        self.hub.leave(socket, channel)

        await socket.send("left", { "channel": channel }, channel, frame.id)

    async def _ping_ ( self, socket: Socket, frame: Frame ) -> None:

        await socket.send("pong", {}, None, frame.id)

    async def _presence_ ( self, socket: Socket, frame: Frame ) -> None:

        channel = frame.channel or ""

        if channel not in socket.channels:

            await self.refuse(socket, frame, "forbidden", "socket.forbidden")

            return

        await socket.send("presence", { "actors": self.hub.presence(channel) }, channel, frame.id)

    async def _whisper_ ( self, socket: Socket, frame: Frame ) -> None:

        target = str(frame.data.get("to", ""))

        if not await self.hub.whisper(socket, target, "whisper", { "data": frame.data.get("data") }):

            await self.refuse(socket, frame, "not_found", "socket.whisper")

    async def _gated_ ( self, socket: Socket, channel: str ) -> bool:

        gate = self._gate

        if gate is None: return True

        try: return bool(await gate(socket, channel))
        except Fault: return False
        except Exception:

            log.exception("socket.gate", channel=channel)

            return False

    async def refuse ( self, socket: Socket, frame: Frame, code: str, reason: str ) -> None:

        await socket.send("error", { "code": code, "reason": reason }, frame.channel, frame.id)

    def describe ( self ) -> dict[str, Any]:

        limits = { "rate": self._rate, "span": self._span, "rooms": self._rooms, "refused": self._refused }

        return { "events": list(self.events()), **limits, **self.hub.describe() }
