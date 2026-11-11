from engine.log import log
from engine.stream import Hls, Variant
from engine.test import Bench
from engine.video import Preset, Probe, RENDITIONS, Track, Videos
from pathlib import Path
from typing import Any
import asyncio, av, tempfile

bench  = Bench()
loop   = asyncio.new_event_loop()
videos = Videos()
root   = Path(tempfile.mkdtemp(prefix="engine-bench-video-"))
clip   = root / "clip.mp4"
probe  = Probe(2.0, "mp4", 400_000, 100_000, (Track("video", "h264", 320, 240, 24.0, 350_000), Track("audio", "aac", bitrate=96_000, channels=2, rate=48_000)))

log.setup("error", "json", Path("/dev/null"))

def synth ( path: Path, seconds: float = 1.0, fps: int = 24, width: int = 320, height: int = 240 ) -> None:

    with av.open(str(path), mode="w") as out:

        picture = out.add_stream("libx264", rate=fps)

        picture.width   = width
        picture.height  = height
        picture.pix_fmt = "yuv420p"
        picture.options = { "crf": "30", "preset": "ultrafast" }

        for index in range(int(seconds * fps)):

            frame = av.VideoFrame(width, height, "rgb24")
            shade = (index * 9) % 256

            frame.planes[0].update(bytes([shade, 255 - shade, 64]) * (width * height))
            frame.pts = None

            for packet in picture.encode(frame): out.mux(packet)

        for packet in picture.encode(None): out.mux(packet)

def run ( work: Any ) -> Any:

    return loop.run_until_complete(work)

def preset () -> None: Preset("720p", width=1280, crf=23, bandwidth=2_800_000)

def dumping () -> None: probe.dump()

def master () -> None: Hls.master([Variant(f"{preset.name}.m3u8", preset.bandwidth, "1280x720", "avc1.640028,mp4a.40.2") for preset in RENDITIONS])

async def probing () -> None: await videos.probe(clip)

async def thumbing () -> None: await videos.thumbnail(clip, 0.5, 160)

async def transcoding () -> None: await videos.transcode(clip, root / "small.mp4", Preset("tiny", width=160, crf=32, speed="ultrafast", bandwidth=200_000))

async def remuxing () -> None: await videos.remux(clip, root / "copy.mkv")

synth(clip)

bench.measure("video.preset", preset)
bench.measure("video.probe.dump", dumping)
bench.measure("video.hls.master", master)
run(bench.measure_async("video.probe", probing, rounds=300))
run(bench.measure_async("video.thumbnail.160", thumbing, rounds=100))
run(bench.measure_async("video.remux.1s", remuxing, rounds=30))
run(bench.measure_async("video.transcode.1s.160p", transcoding, rounds=5))
loop.close()
log.close()

for item in root.iterdir(): item.unlink()

root.rmdir()
