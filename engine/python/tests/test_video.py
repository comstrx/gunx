from aiohttp import BodyPartReader, web
from engine.ai import Ai, Mock
from engine.net import Egress, Remote, net
from engine.video import Asset, Playback
from collections.abc import Awaitable, Callable
from typing import Any, Self, cast
from engine.error import Code, Fault
from engine.fs import file, image
from engine.storage import storage
from engine.stream import Hls
from engine.video import Preset, Probe, RENDITIONS, Videos, video
from fractions import Fraction
from pathlib import Path
import av, math, pytest

FLAG: Any = True

def synth ( path: Path, seconds: float = 2.0, fps: int = 24, width: int = 320, height: int = 240 ) -> None:

    with av.open(str(path), mode="w") as out:

        picture = out.add_stream("libx264", rate=fps)

        picture.width   = width
        picture.height  = height
        picture.pix_fmt = "yuv420p"
        picture.options = { "crf": "30", "preset": "ultrafast" }

        sound = out.add_stream("aac", rate=48000)

        for index in range(int(seconds * fps)):

            frame = av.VideoFrame(width, height, "rgb24")
            shade = (index * 9) % 256

            frame.planes[0].update(bytes([shade, 255 - shade, 64]) * (width * height))
            frame.pts = None

            for packet in picture.encode(frame): out.mux(packet)

        for packet in picture.encode(None): out.mux(packet)

        samples = 1024

        for index in range(int(seconds * 48000 / samples)):

            tone = av.AudioFrame(format="s16", layout="stereo", samples=samples)

            tone.sample_rate = 48000
            tone.pts         = None

            wave = bytearray()

            for n in range(samples):

                value = int(12000 * math.sin(2 * math.pi * 440 * (index * samples + n) / 48000))

                wave += value.to_bytes(2, "little", signed=True) * 2

            tone.planes[0].update(bytes(wave))

            for packet in sound.encode(tone): out.mux(packet)

        for packet in sound.encode(None): out.mux(packet)

async def test_probe_thumbnails_transcode_remux_audio_and_hls ( tmp_path: Path ) -> None:

    source = tmp_path / "clip.mp4"

    synth(source)

    probe = await video.probe(source)

    picture = probe.video()
    sound   = probe.audio()

    assert 1.8 <= probe.duration <= 2.3 and probe.format in ("mov", "mp4") and probe.size > 0 and Probe.dump(probe)["size"] > 0
    assert picture is not None and picture.width == 320 and picture.codec == "h264" and picture.fps == 24.0
    assert sound is not None and sound.codec == "aac" and sound.rate == 48000 and probe.dump()["tracks"][0]["kind"] == "video"
    assert await video.duration(source) == probe.duration

    thumb = await video.thumbnail(source, at=1.0, width=160)
    shot  = await image.decode(thumb)

    assert image.sniff(thumb) == "webp" and shot.width == 160 and shot.height == 120
    assert len(await video.thumbnails(source, count=3, width=80)) == 3

    seen: list[float] = []
    small = await video.transcode(source, tmp_path / "small.mp4", Preset("tiny", width=160, crf=32, speed="ultrafast", bandwidth=200_000), seen.append)

    shrunk = small.video()

    assert shrunk is not None and shrunk.width == 160 and shrunk.height == 120 and small.audio() is not None
    assert seen and seen[-1] == 1.0 and 1.5 <= small.duration <= 2.5

    copied = await video.remux(source, tmp_path / "copy.mkv")
    kept   = copied.video()

    assert copied.format == "matroska" and kept is not None and kept.codec == "h264"

    alone = await video.audio(source, tmp_path / "sound.m4a")
    voice = alone.audio()

    assert voice is not None and voice.codec == "aac" and alone.video() is None

    master = await video.hls(source, tmp_path / "hls", [Preset("240p", width=320, crf=32, speed="ultrafast", bandwidth=400_000), Preset("120p", width=160, crf=34, speed="ultrafast", bandwidth=150_000)], segment=1.0)
    text   = master.read_text()

    assert master.name == "master.m3u8" and "#EXT-X-STREAM-INF:BANDWIDTH=150000,RESOLUTION=160x120" in text and "240p.m3u8" in text
    assert (tmp_path / "hls" / "240p.m3u8").read_text().count("#EXTINF") >= 2 and list((tmp_path / "hls").glob("240p_*.ts"))

    assert video.stats()["transcoded"] >= 3 and video.describe()["renditions"] == [preset.name for preset in RENDITIONS]
    assert RENDITIONS[0].dump()["name"] == "1080p" and Fraction(24).limit_denominator(1001) == 24

    with pytest.raises(Fault) as missing: await video.probe(tmp_path / "nothing.mp4")

    assert missing.value.code is Code.NOT_FOUND and missing.value.reason == "video.file"

    (tmp_path / "junk.mp4").write_bytes(b"not a video")

    with pytest.raises(Fault) as junk: await video.probe(tmp_path / "junk.mp4")

    assert junk.value.code is Code.UNSUPPORTED_MEDIA and junk.value.reason == "video.decode"

    with pytest.raises(Fault) as silent: await video.audio(tmp_path / "junk.mp4", tmp_path / "x.m4a")

    assert silent.value.reason == "video.decode"

    assert Hls.window([], 1) == ([], 0)

async def test_videos_publish_to_storage_and_describe_through_ai ( tmp_path: Path ) -> None:

    source = tmp_path / "clip.mp4"

    synth(source, seconds=1.0)

    disk = storage.local("media", tmp_path / "disk")

    storage.setup({ "media": disk }, "media")

    stored = await video.publish(source, storage, "clips")

    assert [item.key for item in stored] == ["clips/clip.mp4"] and await disk.size("clips/clip.mp4") == source.stat().st_size

    out = tmp_path / "out"

    await file.write(out / "a.m3u8", "#EXTM3U")
    await file.write(out / "v0" / "seg.ts", b"x")

    assert sorted(item.key for item in await video.publish(out, storage, "hls")) == ["hls/a.m3u8", "hls/v0/seg.ts"]

    brain = Ai()
    model = Mock()

    brain.use(model, default=True)

    text = await video.narrate(source, brain, "What happens?", frames=2, width=160)

    assert text.startswith("echo: What happens?") and len(model.seen[-1][0].images) == 2 and image.sniff(model.seen[-1][0].images[0]) == "jpeg"

async def test_the_local_driver_packages_and_serves_through_storage ( tmp_path: Path ) -> None:

    source = tmp_path / "clip.mp4"

    synth(source, seconds=1.0)

    disk = storage.local("cdn", tmp_path / "cdn", "https://cdn.test", public=True)

    storage.setup({ "cdn": disk }, "cdn")

    driver = video.use(video.local(storage, "library"))

    assert video.describe()["driver"] == "local" and driver.can("upload") and not driver.can("sign")

    asset = await video.upload(source, renditions=RENDITIONS[-1:])

    assert asset.name == "clip.mp4" and asset.ready and asset.duration > 0.5 and asset.dump()["format"] == "mov"
    assert (await video.status(asset.id)) == asset and await video.assets() == [asset]

    shown = await video.playback(asset.id)

    assert shown == Playback(f"https://cdn.test/library/{asset.id}/master.m3u8", None, f"https://cdn.test/library/{asset.id}/poster.webp")
    poster = await video.poster(asset.id)

    assert isinstance(poster, bytes) and image.sniff(poster) == "webp" and await disk.exists(f"library/{asset.id}/master.m3u8")
    assert (await video.status(asset.id)).ready

    with pytest.raises(Fault) as unsigned: await video.sign(asset.id)

    assert unsigned.value.reason == "video.capability"

    fresh = video.local(storage, "library")

    assert (await fresh.status(asset.id)).ready and await video.delete(asset.id) and not await video.delete(asset.id)

    with pytest.raises(Fault) as gone: await fresh.status("nothing")

    assert gone.value.code is Code.NOT_FOUND and gone.value.reason == "video.missing"

    video.use(video.local(storage))

class StreamFake:

    def __init__ ( self ) -> None:

        self.port  = 0
        self.seen: list[str] = []
        self.uploads: list[tuple[str, int]] = []
        self._runner: web.AppRunner | None = None

    async def __aenter__ ( self ) -> Self:

        app = web.Application()

        app.router.add_post("/accounts/acc-1/stream", self.upload)
        app.router.add_get("/accounts/acc-1/stream", self.list)
        app.router.add_get("/accounts/acc-1/stream/{uid}", self.status)
        app.router.add_post("/accounts/acc-1/stream/{uid}/token", self.token)
        app.router.add_delete("/accounts/acc-1/stream/{uid}", self.remove)

        self._runner = web.AppRunner(app)

        await self._runner.setup()

        site = web.TCPSite(self._runner, "127.0.0.1", 0)

        await site.start()

        self.port = int(self._runner.addresses[0][1])

        return self

    async def __aexit__ ( self, *_: object ) -> None:

        if self._runner is not None: await self._runner.cleanup()

    def check ( self, request: web.Request ) -> None:

        assert request.headers["Authorization"] == "Bearer cf-token"

        self.seen.append(f"{request.method} {request.path}")

    def item ( self, uid: str, ready: bool = True ) -> dict[str, Any]:

        return { "uid": uid, "meta": { "name": "clip.mp4" }, "readyToStream": ready, "duration": 1.0, "size": 2048, "status": { "state": "ready" if ready else "queued" }, "preview": f"https://watch.test/{uid}" }

    async def upload ( self, request: web.Request ) -> web.Response:

        self.check(request)

        reader = await request.multipart()
        part   = await reader.next()

        assert isinstance(part, BodyPartReader) and part.name == "file" and part.filename == "clip.mp4"

        self.uploads.append((str(part.filename), len(await part.read())))

        return web.json_response({ "success": True, "result": self.item("vid-1", ready=False) })

    async def list ( self, request: web.Request ) -> web.Response:

        self.check(request)

        return web.json_response({ "success": True, "result": [self.item("vid-1"), self.item("vid-2")] })

    async def status ( self, request: web.Request ) -> web.Response:

        self.check(request)

        uid = request.match_info["uid"]

        if uid == "broken": return web.json_response({ "success": False, "errors": [{ "message": "nope" }] })

        return web.json_response({ "success": True, "result": self.item(uid) })

    async def token ( self, request: web.Request ) -> web.Response:

        self.check(request)

        body = await request.json()

        return web.json_response({ "success": True, "result": { "token": f"signed-{body['exp']}" } })

    async def remove ( self, request: web.Request ) -> web.Response:

        self.check(request)

        return web.json_response({ "success": True, "result": None })

async def test_cloudflare_stream_speaks_its_api ( tmp_path: Path ) -> None:

    source = tmp_path / "clip.mp4"

    synth(source, seconds=0.5)

    async with StreamFake() as fake:

        driver = video.cloudflare(net, "cf-token", "acc-1", "customer-x")

        driver._remote = Remote(net, f"http://127.0.0.1:{fake.port}", egress=Egress(allow_private=True, ports=frozenset()), name="cloudflare").bearer("cf-token")  # noqa: SLF001

        video.use(driver)

        assert video.describe()["driver"] == "cloudflare" and driver.can("sign")

        asset = await video.upload(source)

        assert asset == Asset("vid-1", "clip.mp4", ready=False, duration=1.0, size=2048, facts={ "state": "queued", "preview": "https://watch.test/vid-1", "created": None })
        assert fake.uploads == [("clip.mp4", source.stat().st_size)] and (await video.status("vid-1")).ready
        assert [item.id for item in await video.assets()] == ["vid-1", "vid-2"]

        shown = await video.playback("vid-1")

        assert shown.hls == "https://customer-x.cloudflarestream.com/vid-1/manifest/video.m3u8" and shown.dash is not None and shown.dash.endswith(".mpd")
        assert await video.poster("vid-1", 2.5, 320) == "https://customer-x.cloudflarestream.com/vid-1/thumbnails/thumbnail.jpg?time=2.5s&width=320"
        assert await video.sign("vid-1", 60) == "signed-60" and await video.delete("vid-1")

        with pytest.raises(Fault) as refused: await video.status("broken")

        assert refused.value.code is Code.UNAVAILABLE and refused.value.reason == "video.cloudflare"
        assert fake.seen[0] == "POST /accounts/acc-1/stream" and fake.seen[-1] == "GET /accounts/acc-1/stream/broken"

    await net.close()

    with pytest.raises(Fault) as unset: Videos().driver()

    assert unset.value.reason == "video.setup"

async def test_presets_and_settings_are_validated ( tmp_path: Path ) -> None:

    wrongs: tuple[tuple[str, Callable[[], object]], ...] = (
        ("name", lambda: Preset("")), ("name", lambda: Preset("a b")), ("name", lambda: Preset(cast("Any", 7))), ("name", lambda: Preset("x", codec="")),
        ("crf", lambda: Preset("x", crf=-1)), ("crf", lambda: Preset("x", crf=52)), ("crf", lambda: Preset("x", crf=cast("Any", 23.0))),
        ("speed", lambda: Preset("x", speed="turbo")), ("speed", lambda: Preset("x", pixel="rgb24")), ("width", lambda: Preset("x", width=1)),
        ("width", lambda: Preset("x", width=7681)), ("height", lambda: Preset("x", height=cast("Any", "720"))), ("fps", lambda: Preset("x", fps=0)),
        ("fps", lambda: Preset("x", fps=241)), ("fps", lambda: Preset("x", fps=FLAG)), ("bitrate", lambda: Preset("x", bitrate=100)),
        ("bandwidth", lambda: Preset("x", bandwidth=cast("Any", "fast"))),
    )

    for what, make in wrongs:

        with pytest.raises(Fault) as refused: make()

        assert refused.value.code is Code.INTERNAL and refused.value.reason == "video.preset" and refused.value.errors == { "preset": [what] }, what

    assert Preset("x", width=None, height=None, fps=29.97).fps == 29.97

    source = tmp_path / "clip.mp4"

    synth(source, seconds=1.0)

    unsets: tuple[tuple[str, Awaitable[object]], ...] = (
        ("count", video.thumbnails(source, 0)), ("count", video.thumbnails(source, 101)), ("count", video.thumbnails(source, cast("Any", "3"))),
        ("at", video.thumbnail(source, -1)), ("at", video.thumbnail(source, cast("Any", None))), ("width", video.thumbnail(source, 0.5, 1)),
        ("segment", video.hls(source, tmp_path / "hls", segment=0.1)), ("segment", video.hls(source, tmp_path / "hls", segment=61)),
        ("renditions", video.hls(source, tmp_path / "hls", [])), ("renditions", video.hls(source, tmp_path / "hls", cast("Any", ["720p"]))),
    )

    for setting, work in unsets:

        with pytest.raises(Fault) as unset: await work

        assert unset.value.reason == "video.settings" and unset.value.errors == { "setting": [setting] }, setting
