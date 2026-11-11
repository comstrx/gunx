from collections.abc import Sequence
from fractions import Fraction
from pathlib import Path
from typing import Any, TYPE_CHECKING, cast

from engine.ai import Ai, Message
from engine.error import Code, Fault
from engine.fs import Picture, dir, file, image
from engine.log import log
from engine.net import Net, Remote
from engine.storage import Storage, Stored
from engine.stream import Hls, Variant
from engine.thread import thread
from .arch import (
    Asset, CLOUDFLARE, CODECS, EVEN, LONGEST, MICRO, Playback, Preset, Probe, Progress, RENDITIONS, SAMPLE, SECOND,
    SHORTEST, SHOTS, SLOWEST, Track, WIDEST,
)
from .cloudflare import Cloudflare
from .driver import Driver
from .local import Local

if TYPE_CHECKING:

    from av import AudioStream, VideoStream

class Videos:

    def __init__ ( self ) -> None:

        self._probed     = 0
        self._transcoded = 0
        self._driver: Driver | None = None

    def use ( self, driver: Driver ) -> Driver:

        self._driver = driver

        return driver

    def driver ( self ) -> Driver:

        if self._driver is None: raise Fault(Code.INTERNAL, reason="video.setup")

        return self._driver

    def local ( self, storage: Storage, folder: str = "videos", disk: str | None = None ) -> Local:

        return Local(self, storage, folder, disk)

    def cloudflare ( self, net: Net, token: str, account: str, customer: str ) -> Cloudflare:

        return Cloudflare(Remote(net, CLOUDFLARE, name="cloudflare").bearer(token), account, customer)

    async def upload ( self, source: Path, name: str | None = None, **options: Any ) -> Asset:

        return await self.driver().upload(source, name or source.name, **options)

    async def status ( self, id_: str ) -> Asset:

        return await self.driver().status(id_)

    async def playback ( self, id_: str ) -> Playback:

        return await self.driver().playback(id_)

    async def poster ( self, id_: str, at: float = 1.0, width: int = 640 ) -> bytes | str:

        return await self.driver().thumbnail(id_, at, width)

    async def sign ( self, id_: str, seconds: int = 3600 ) -> str:

        return await self.driver().sign(id_, seconds)

    async def delete ( self, id_: str ) -> bool:

        return await self.driver().delete(id_)

    async def assets ( self, limit: int = 100 ) -> list[Asset]:

        return await self.driver().assets(limit)

    async def probe ( self, path: Path ) -> Probe:

        made = await thread.offload(self._probe_, path)

        self._probed += 1

        return made

    async def duration ( self, path: Path ) -> float:

        return (await self.probe(path)).duration

    async def thumbnail ( self, path: Path, at: float = SECOND, width: int = 640, format_: str = "webp" ) -> bytes:

        moment: object = at

        if not isinstance(moment, int | float) or type(moment) is bool: raise self._unset_("at")
        if not 0 <= moment <= LONGEST: raise self._unset_("at")
        if type(width) is not int or not EVEN <= width <= WIDEST: raise self._unset_("width")

        picture = await thread.offload(self._frame_, path, at)

        return await image.encode(await image.resize(picture, width=min(width, picture.width)), format_)

    async def thumbnails ( self, path: Path, count: int = 5, width: int = 320, format_: str = "webp" ) -> list[bytes]:

        if type(count) is not int or not 1 <= count <= SHOTS: raise self._unset_("count")

        length = await self.duration(path)
        step   = length / (count + 1)

        return [await self.thumbnail(path, step * (index + 1), width, format_) for index in range(count)]

    async def transcode (
        self, source: Path, target: Path, preset: Preset | None = None, progress: Progress | None = None,
    ) -> Probe:

        chosen = preset or Preset()

        await thread.offload(self._transcode_, source, target, chosen, None, progress)

        self._transcoded += 1

        log.info("video.transcoded", target=target.name, preset=chosen.name)

        return await self.probe(target)

    async def remux ( self, source: Path, target: Path ) -> Probe:

        await thread.offload(self._remux_, source, target)

        return await self.probe(target)

    async def audio ( self, source: Path, target: Path, codec: str = "aac", bitrate: int = 128_000 ) -> Probe:

        await thread.offload(self._audio_, source, target, codec, bitrate)

        return await self.probe(target)

    async def publish (
        self, source: Path, storage: Storage, folder: str = "videos", disk: str | None = None,
    ) -> list[Stored]:

        single = await file.has(source)
        paths  = [source] if single else await dir.walk(source)
        base   = source.parent if single else source
        kept: list[Stored] = []

        for path in paths:

            key = f"{folder.strip('/')}/{path.relative_to(base).as_posix()}"

            kept.append(await storage.disk(disk).put(key, await file.read(path)))

        return kept

    async def narrate (
        self, path: Path, ai: Ai, prompt: str = "Describe this video.", frames: int = 4, width: int = 512,
        task: str = "chat",
    ) -> str:

        shots = await self.thumbnails(path, frames, width, "jpeg")
        facts = (await self.probe(path)).dump()
        text  = f"{prompt}\nMetadata: {facts}\nThe attached frames are evenly spaced samples."
        reply = await ai.chat([Message("user", text, images=tuple(shots))], task=task)

        return reply.text

    async def hls (
        self, source: Path, folder: Path, renditions: Sequence[Preset] = RENDITIONS, segment: float = 4.0,
        progress: Progress | None = None,
    ) -> Path:

        pace: object = segment

        if not isinstance(pace, int | float) or type(pace) is bool: raise self._unset_("segment")
        if not SHORTEST <= pace <= SLOWEST: raise self._unset_("segment")
        if not renditions or not all(isinstance(preset, Preset) for preset in renditions):

            raise self._unset_("renditions")

        probe = await self.probe(source)
        track = probe.video()

        if track is None or not track.width or not track.height:

            raise Fault(Code.UNSUPPORTED_MEDIA, reason="video.track")

        fitting  = [preset for preset in renditions if preset.width is None or preset.width <= track.width]
        variants = []

        await dir.make(folder)

        for preset in fitting or [renditions[-1]]:

            playlist = folder / f"{preset.name}.m3u8"
            options  = {
                "hls_time": f"{segment:g}", "hls_playlist_type": "vod", "hls_flags": "independent_segments",
                "hls_segment_filename": str(folder / f"{preset.name}_%04d.ts"),
            }

            await thread.offload(self._transcode_, source, playlist, preset, options, progress, segment)

            width  = self._even_(min(preset.width or track.width, track.width))
            height = self._even_(round(width * track.height / track.width))

            variants.append(Variant(playlist.name, preset.bandwidth, f"{width}x{height}", CODECS))

        master = folder / "master.m3u8"

        await file.write(master, Hls.master(variants), durable=False)

        self._transcoded += len(variants)

        return master

    def stats ( self ) -> dict[str, int]:

        return { "probed": self._probed, "transcoded": self._transcoded }

    def describe ( self ) -> dict[str, Any]:

        driver = self._driver.name if self._driver is not None else None

        return { "renditions": [preset.name for preset in RENDITIONS], "driver": driver, **self.stats() }

    def _probe_ ( self, path: Path ) -> Probe:

        import av

        try: container = av.open(str(path))
        except (av.FFmpegError, OSError) as error: raise self._refuse_(path, error) from error

        with container:

            tracks   = [self._picture_(stream) for stream in container.streams.video]
            tracks  += [self._sound_(stream) for stream in container.streams.audio]
            duration = (container.duration or 0) / MICRO
            name     = str(container.format.name).split(",")[0]

            return Probe(duration, name, int(container.bit_rate or 0), int(container.size or 0), tuple(tracks))

    def _picture_ ( self, stream: VideoStream ) -> Track:

        rate = stream.average_rate

        return Track(
            "video", stream.codec_context.name, stream.width, stream.height, round(float(rate), 3) if rate else None,
            stream.bit_rate or None, language=stream.metadata.get("language"),
        )

    def _sound_ ( self, stream: AudioStream ) -> Track:

        return Track(
            "audio", stream.codec_context.name, bitrate=stream.bit_rate or None, channels=stream.channels,
            rate=stream.rate, language=stream.metadata.get("language"),
        )

    def _frame_ ( self, path: Path, at: float ) -> Picture:

        import av

        try: container = av.open(str(path))
        except (av.FFmpegError, OSError) as error: raise self._refuse_(path, error) from error

        with container:

            if not container.streams.video: raise Fault(Code.UNSUPPORTED_MEDIA, reason="video.track")

            stream = container.streams.video[0]

            stream.thread_type = "AUTO"

            container.seek(int(max(0.0, at) * MICRO), backward=True, any_frame=False)

            for frame in container.decode(stream):

                if frame.time >= at - SECOND / 10: return Picture(frame.to_image(), "png")

            raise Fault(Code.NOT_FOUND, reason="video.frame")

    def _transcode_ (
        self, source: Path, target: Path, preset: Preset, options: dict[str, str] | None, progress: Progress | None,
        keyframes: float | None = None,
    ) -> None:

        import av

        try: inbound = av.open(str(source))
        except (av.FFmpegError, OSError) as error: raise self._refuse_(source, error) from error

        with inbound:

            if not inbound.streams.video: raise Fault(Code.UNSUPPORTED_MEDIA, reason="video.track")

            video = inbound.streams.video[0]
            audio = inbound.streams.audio[0] if inbound.streams.audio else None
            total = (inbound.duration or 0) / MICRO

            video.thread_type = "AUTO"

            with av.open(str(target), mode="w", format="hls" if options else None, options=options or {}) as outbound:

                rate   = preset.fps or float(video.average_rate or 25)
                width  = self._even_(min(preset.width or video.width, video.width))
                height = preset.height or self._even_(round(width * video.height / video.width))
                frames = Fraction(rate).limit_denominator(1001)
                out    = cast("VideoStream", outbound.add_stream(preset.codec, rate=frames))
                tuning: dict[str, object] = { "crf": str(preset.crf), "preset": preset.speed }

                tuning["profile"] = preset.profile

                if keyframes:

                    gop = max(1, round(rate * keyframes))

                    out.codec_context.gop_size = gop

                    tuning["x264-params"] = f"keyint={gop}:min-keyint={gop}:scenecut=0"

                out.width   = width
                out.height  = height
                out.pix_fmt = preset.pixel
                out.options = tuning

                sound     = cast("AudioStream", outbound.add_stream(preset.audio, rate=SAMPLE)) if audio else None
                resampler = av.AudioResampler(format="fltp", layout="stereo", rate=SAMPLE)
                last      = -1.0

                if sound is not None: sound.bit_rate = preset.bitrate

                for packet in inbound.demux(*[stream for stream in (video, audio) if stream is not None]):

                    for frame in packet.decode():

                        if isinstance(frame, av.VideoFrame):

                            picture = frame.reformat(width=width, height=height, format=preset.pixel)

                            for encoded in out.encode(picture): outbound.mux(encoded)

                            if progress and total and frame.time - last >= SECOND:

                                last = frame.time

                                progress(min(1.0, frame.time / total))

                        elif isinstance(frame, av.AudioFrame) and sound is not None:

                            for piece in resampler.resample(frame):

                                for encoded in sound.encode(piece): outbound.mux(encoded)

                for encoded in out.encode(None): outbound.mux(encoded)

                if sound is not None:

                    for encoded in sound.encode(None): outbound.mux(encoded)

        if progress: progress(1.0)

    def _remux_ ( self, source: Path, target: Path ) -> None:

        import av

        try: inbound = av.open(str(source))
        except (av.FFmpegError, OSError) as error: raise self._refuse_(source, error) from error

        with inbound, av.open(str(target), mode="w") as outbound:

            chosen  = [stream for stream in inbound.streams if stream.type in ("video", "audio")]
            mapping = { stream: outbound.add_stream_from_template(stream) for stream in chosen }

            for packet in inbound.demux(*chosen):

                if packet.dts is None: continue

                packet.stream = mapping[packet.stream]

                outbound.mux(packet)

    def _audio_ ( self, source: Path, target: Path, codec: str, bitrate: int ) -> None:

        import av

        try: inbound = av.open(str(source))
        except (av.FFmpegError, OSError) as error: raise self._refuse_(source, error) from error

        with inbound:

            if not inbound.streams.audio: raise Fault(Code.UNSUPPORTED_MEDIA, reason="video.audio")

            audio = inbound.streams.audio[0]

            with av.open(str(target), mode="w") as outbound:

                sound     = cast("AudioStream", outbound.add_stream(codec, rate=SAMPLE))
                resampler = av.AudioResampler(format="fltp", layout="stereo", rate=SAMPLE)

                sound.bit_rate = bitrate

                for frame in inbound.decode(audio):

                    for piece in resampler.resample(frame):

                        for encoded in sound.encode(piece): outbound.mux(encoded)

                for encoded in sound.encode(None): outbound.mux(encoded)

    def _refuse_ ( self, path: Path, error: BaseException ) -> Fault:

        if isinstance(error, FileNotFoundError):

            return Fault(Code.NOT_FOUND, reason="video.file", errors={ "path": [path.name] })

        return Fault(Code.UNSUPPORTED_MEDIA, str(error)[:200], "video.decode", { "path": [path.name] })

    def _even_ ( self, value: int ) -> int:

        return max(2, value - value % 2)

    @staticmethod
    def _unset_ ( what: str ) -> Fault:

        return Fault(Code.INTERNAL, reason="video.settings", errors={ "setting": [what] })
