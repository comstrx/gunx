from engine.stream import Hls, Range, Segment, stream
from collections.abc import AsyncIterator
import asyncio
from engine.test import Bench

bench = Bench()
segments = [Segment(f"seg{n}.ts", 4.0) for n in range(200)]

bench.measure("stream.range.parse", lambda: Range.parse("bytes=1024-4095", 1 << 30))
bench.measure("stream.hls.media", lambda: Hls.media(segments, live=True), rounds=2000)

payload = b"x" * (1 << 20)

async def pieces () -> AsyncIterator[bytes]:

    yield payload

async def rechunk () -> None:

    async for _ in stream.chunks(pieces(), 1 << 18): pass

asyncio.run(bench.measure_async("stream.chunks.1MiB", rechunk, rounds=200))
