from collections import deque
from typing import Any, TYPE_CHECKING, override

import asyncio, hiredis

if TYPE_CHECKING:

    from .wire import Wire

class Replies(asyncio.Protocol):

    def __init__ ( self, wire: Wire ) -> None:

        self.reader    = hiredis.Reader()
        self.pending: deque[tuple[asyncio.Future[Any], float]] = deque()
        self.staged: list[bytes] = []
        self.transport: Any = None
        self.wire      = wire
        self.wait      = wire.wait
        self.loop      = asyncio.get_running_loop()
        self.timer: asyncio.TimerHandle | None = None
        self.failure: BaseException | None = None
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

            future, _ = self.pending.popleft()

            if future.done(): continue

            if isinstance(value, hiredis.ReplyError): future.set_exception(value)
            else: future.set_result(value)

    @override
    def connection_lost ( self, exc: BaseException | None ) -> None:

        self.transport = None

        if self.timer is not None:

            self.timer.cancel()

            self.timer = None

        failure     = self.failure or exc or ConnectionError("redis closed")
        self.staged = []

        while self.pending:

            future, _ = self.pending.popleft()

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

    def submit ( self, command: bytes ) -> asyncio.Future[Any]:

        loop = self.loop
        future: asyncio.Future[Any] = loop.create_future()

        if self.transport is None:

            future.set_exception(self.failure or ConnectionError("redis closed"))

            return future

        self.pending.append((future, loop.time() + self.wait))

        if self.timer is None: self.timer = loop.call_later(self.wait, self.expire)
        if not self.staged: loop.call_soon(self.flush)

        self.staged.append(command)

        return future

    def flush ( self ) -> None:

        staged, self.staged = self.staged, []

        if self.transport is None or not staged: return

        self.transport.write(staged[0] if len(staged) == 1 else b"".join(staged))

    def expire ( self ) -> None:

        self.timer = None

        if not self.pending or self.transport is None: return

        remaining = self.pending[0][1] - self.loop.time()

        if remaining > 0:

            self.timer = self.loop.call_later(remaining, self.expire)

            return

        self.failure = TimeoutError("redis")

        self.transport.abort()
