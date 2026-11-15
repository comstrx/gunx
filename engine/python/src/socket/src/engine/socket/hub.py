from collections import deque
from collections.abc import Mapping, Sequence
from typing import Any

from engine.error import Code, Fault
from .arch import roomed, whole
from .socket import Socket
from .frame import Frame
import asyncio

class Hub:

    def __init__ ( self, capacity: int = 10000, history: int = 0 ) -> None:

        self._sockets: dict[str, Socket] = {}
        self._channels: dict[str, dict[str, None]] = {}
        self._history: dict[str, deque[tuple[str, dict[str, Any]]]] = {}
        self._capacity = whole(capacity, "capacity")
        self._keep     = whole(history, "history", 0)

    def add ( self, socket: Socket ) -> None:

        if len(self._sockets) >= self._capacity: raise Fault(Code.UNAVAILABLE, reason="socket.capacity")

        self._sockets[socket.id] = socket

    def remove ( self, socket: Socket ) -> None:

        for channel in list(socket.channels): self.leave(socket, channel)

        self._sockets.pop(socket.id, None)

    def join ( self, socket: Socket, channel: str ) -> None:

        if not roomed(channel): raise Fault(Code.VALIDATION, reason="socket.channel")

        socket.channels.add(channel)
        self._channels.setdefault(channel, {})[socket.id] = None

    def history ( self, channel: str ) -> list[tuple[str, dict[str, Any]]]:

        return list(self._history.get(channel, ()))

    async def replay ( self, socket: Socket, channel: str ) -> int:

        held = self.history(channel)

        for event, data in held: await socket.send(event, data, channel)

        return len(held)

    def leave ( self, socket: Socket, channel: str ) -> None:

        socket.channels.discard(channel)

        members = self._channels.get(channel)

        if members is not None:

            members.pop(socket.id, None)

            if not members: self._channels.pop(channel, None)

    def members ( self, channel: str ) -> list[Socket]:

        return [self._sockets[id_] for id_ in self._channels.get(channel, {}) if id_ in self._sockets]

    def find ( self, id_: str ) -> Socket | None:

        return self._sockets.get(id_)

    def presence ( self, channel: str ) -> list[Any]:

        seen: list[Any] = []

        for socket in self.members(channel):

            if socket.actor is not None and socket.actor not in seen: seen.append(socket.actor)

        return seen

    async def broadcast ( self, event: str, data: Mapping[str, Any] | None = None, skip: str | None = None ) -> int:

        targets = [socket for socket in self._sockets.values() if socket.id != skip]

        return await self._send_(targets, event, data)

    async def whisper ( self, sender: Socket, target: str, event: str, data: Mapping[str, Any] | None = None ) -> bool:

        found = self._sockets.get(target)

        if found is None or found is sender or not (found.channels & sender.channels): return False

        await found.send(event, { "from": sender.id, **dict(data or {}) })

        return True

    def count ( self, channel: str | None = None ) -> int:

        return len(self._channels.get(channel, {})) if channel else len(self._sockets)

    def channels ( self ) -> tuple[str, ...]:

        return tuple(sorted(self._channels))

    async def emit (
        self, channel: str, event: str, data: Mapping[str, Any] | None = None, skip: str | None = None,
    ) -> int:

        targets = self.members(channel)

        if skip is not None: targets = [socket for socket in targets if socket.id != skip]

        if self._keep:

            history = self._history.get(channel)

            if history is None: history = self._history[channel] = deque(maxlen=self._keep)

            history.append((event, dict(data or {})))

        return await self._send_(targets, event, data, channel)

    async def send_to ( self, actor: Any, event: str, data: Mapping[str, Any] | None = None ) -> int:

        targets = [socket for socket in self._sockets.values() if socket.actor == actor]

        return await self._send_(targets, event, data)

    async def _send_ (
        self, targets: Sequence[Socket], event: str, data: Mapping[str, Any] | None, channel: str | None = None,
    ) -> int:

        if not targets: return 0

        frame = Frame(event=event, channel=channel, data=dict(data or {})).encode().decode()

        if len(targets) == 1: await targets[0].write(frame)
        else: await asyncio.gather(*(socket.write(frame) for socket in targets))

        return len(targets)

    async def close_all ( self, code: int = 1001, reason: str = "shutdown" ) -> int:

        sockets = list(self._sockets.values())

        await asyncio.gather(*(socket.close(code, reason) for socket in sockets))

        self._sockets  = {}
        self._channels = {}
        self._history  = {}

        return len(sockets)

    def describe ( self ) -> dict[str, Any]:

        channels = { name: len(ids) for name, ids in sorted(self._channels.items()) }

        return { "sockets": len(self._sockets), "channels": channels, "history": self._keep }
