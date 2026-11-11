from engine.stream import Hls, Range, Segment
from engine.test import Bench

bench = Bench()
segments = [Segment(f"seg{n}.ts", 4.0) for n in range(200)]

bench.measure("stream.range.parse", lambda: Range.parse("bytes=1024-4095", 1 << 30))
bench.measure("stream.hls.media", lambda: Hls.media(segments, live=True), rounds=2000)
