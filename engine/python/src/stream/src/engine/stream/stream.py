from collections.abc import AsyncIterator
from contextlib import aclosing
from pathlib import Path
from typing import Any

from engine.date import date
from engine.error import Code, Fault
from engine.fs import file
from engine.json import json
from engine.thread import thread
from .arch import CHUNK, LEAST, MEDIA, OK, PARTIAL, SAME, Served
from .pipe import Pipe
from .range import Range
from .tee import Tee
import asyncio

class Stream:

    def __init__ ( self ) -> None:

        self._chunk  = CHUNK
        self._served = 0
        self._bytes  = 0

    def setup ( self, chunk: int = CHUNK ) -> None:

        if chunk < LEAST: raise Fault(Code.INTERNAL, reason="stream.chunk")

        self._chunk = chunk

    def etag ( self, size: int, modified: int ) -> str:

        return f'W/"{size:x}-{modified:x}"'

    async def file (
        self, path: Path, media: str = MEDIA, range_: str | None = None, match: str | None = None,
        condition: str | None = None, head: bool = False, cache: int = 0, name: str | None = None,
    ) -> Served:

        try: stat = await thread.offload(path.stat)
        except FileNotFoundError as error: raise Fault(Code.NOT_FOUND, reason="stream.file") from error

        size    = int(stat.st_size)
        tag     = self.etag(size, int(stat.st_mtime_ns))
        headers = {
            "Accept-Ranges" : "bytes",
            "ETag"          : tag,
            "Last-Modified" : date.http(date.of(stat.st_mtime)),
            "Cache-Control" : f"public, max-age={cache}" if cache else "no-store",
        }

        if name: headers["Content-Disposition"] = f'attachment; filename="{file.safe(name)}"'

        if match and (match.strip() == "*" or tag in { part.strip() for part in match.split(",") }):

            return Served(SAME, headers, media, None, 0)

        if condition is not None and condition.strip() != tag: range_ = None

        selected = Range.parse(range_, size)
        status   = OK if selected is None else PARTIAL
        start    = 0 if selected is None else selected.start
        end      = size - 1 if selected is None else selected.end
        length   = 0 if size == 0 else end - start + 1

        if selected is not None: headers["Content-Range"] = selected.header()

        headers["Content-Length"] = str(length)

        self._served += 1

        body = None if head or length == 0 else self.slice(path, start, end)

        return Served(status, headers, media, body, length)

    async def slice ( self, path: Path, start: int, end: int, chunk: int | None = None ) -> AsyncIterator[bytes]:

        try:

            async with aclosing(file.stream(path, chunk or self._chunk, start, end)) as pieces:

                async for piece in pieces:

                    self._bytes += len(piece)

                    yield piece

        except Fault as fault:

            if fault.code is not Code.NOT_FOUND: raise

            raise Fault(Code.NOT_FOUND, reason="stream.file") from fault

    async def chunks ( self, source: AsyncIterator[bytes], size: int | None = None ) -> AsyncIterator[bytes]:

        wanted = size or self._chunk
        held   = bytearray()

        async for piece in source:

            held.extend(piece)

            while len(held) >= wanted:

                yield bytes(held[:wanted])

                del held[:wanted]

        if held: yield bytes(held)

    async def lines ( self, source: AsyncIterator[object] ) -> AsyncIterator[bytes]:

        async for item in source: yield json.encode(item) + b"\n"

    async def pace ( self, source: AsyncIterator[bytes], rate: int, burst: int | None = None ) -> AsyncIterator[bytes]:

        if rate <= 0: raise Fault(Code.INTERNAL, reason="stream.rate")

        loop    = asyncio.get_running_loop()
        allow   = float(burst or rate)
        tokens  = allow
        checked = loop.time()

        async for piece in source:

            now      = loop.time()
            tokens   = min(allow, tokens + (now - checked) * rate)
            checked  = now
            tokens  -= len(piece)

            if tokens < 0:

                await asyncio.sleep(-tokens / rate)

                tokens  = 0.0
                checked = loop.time()

            yield piece

    def pipe ( self, capacity: int = 64 ) -> Pipe:

        return Pipe(capacity)

    def tee ( self, capacity: int = 64, drop: bool = True ) -> Tee:

        return Tee(capacity, drop)

    def stats ( self ) -> dict[str, int]:

        return { "served": self._served, "bytes": self._bytes }

    def describe ( self ) -> dict[str, Any]:

        return { "chunk": self._chunk, **self.stats() }
