from collections import deque
from typing import Any, TYPE_CHECKING, override

from engine.thread import Gate
import asyncio, hiredis

if TYPE_CHECKING:

    from .wire import Wire

class Replies(asyncio.Protocol):

    def __init__ ( self, wire: Wire ) -> None:

        self.reader    = hiredis.Reader()
        self.pending: deque[tuple[asyncio.Future[Any], float, Gate | None]] = deque()
        self.transport: Any = None
        self.wire      = wire
        self.wait      = wire.wait
        self.loop      = asyncio.get_running_loop()
        self.timer: asyncio.TimerHandle | None = None
        self.failure: BaseException | None = None
        self.outgoing: list[bytes] = []
        self.flush: asyncio.Handle | None = None
        self.writable  = asyncio.Event()

        self.writable.set()

    @override
    def connection_made ( self, transport: Any ) -> None:

        self.reader    = hiredis.Reader()
        self.failure   = None
        self.transport = transport

    @override
    def data_received ( self, data: bytes ) -> None:

        self.reader.feed(data)

        while True:

            try: value = self.reader.gets()
            except hiredis.ProtocolError as error:

                self.failure = error

                self.transport.abort()

                return

            if value is False: return

            if not self.pending:

                self.transport.abort()

                return

            future, _, gate = self.pending.popleft()

            if gate is not None: gate.release()

            if future.done(): continue

            if isinstance(value, hiredis.ReplyError): future.set_exception(value)
            else: future.set_result(value)

    @override
    def connection_lost ( self, exc: BaseException | None ) -> None:

        self.transport = None

        if self.flush is not None: self.flush.cancel()

        self.flush = None
        self.outgoing.clear()

        if self.timer is not None:

            self.timer.cancel()

            self.timer = None

        failure     = self.failure or exc or ConnectionError("redis closed")

        while self.pending:

            future, _, gate = self.pending.popleft()

            if gate is not None: gate.release()

            if not future.done(): future.set_exception(failure)

        self.writable.set()
        self.wire.dropped(self)

    @override
    def pause_writing ( self ) -> None:

        self.writable.clear()

    @override
    def resume_writing ( self ) -> None:

        self.writable.set()

    def alive ( self ) -> bool:

        return self.transport is not None and not self.transport.is_closing()

    def submit ( self, command: bytes, gate: Gate | None = None ) -> asyncio.Future[Any]:

        loop = self.loop
        future: asyncio.Future[Any] = loop.create_future()

        if self.transport is None:

            if gate is not None: gate.release()

            future.set_exception(self.failure or ConnectionError("redis closed"))

            return future

        self.pending.append((future, loop.time() + self.wait, gate))

        if self.timer is None: self.timer = loop.call_later(self.wait, self.expire)
        self.outgoing.append(command)

        if self.flush is None: self.flush = loop.call_soon(self.write)

        return future

    def write ( self ) -> None:

        self.flush = None

        if not self.outgoing or self.transport is None: return

        commands, self.outgoing = self.outgoing, []

        try: self.transport.write(commands[0] if len(commands) == 1 else b"".join(commands))
        except (OSError, RuntimeError) as error:

            self.failure = error
            self.transport.abort()

    def expire ( self ) -> None:

        self.timer = None

        if not self.pending or self.transport is None: return

        remaining = self.pending[0][1] - self.loop.time()

        if remaining > 0:

            self.timer = self.loop.call_later(remaining, self.expire)

            return

        self.failure = TimeoutError("redis")

        self.transport.abort()
