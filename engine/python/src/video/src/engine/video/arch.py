from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from engine.error import Code, Fault

type Progress = Callable[[float], None]

NAME    = 64
CRF     = 51
WIDEST  = 7_680
FASTEST = 240.0
LEAST   = 8_000
MOST    = 100_000_000
SHOTS   = 100
LONGEST = 86_400.0
EVEN    = 2
SHORTEST = 0.5
SLOWEST  = 60.0
SPEEDS  = frozenset({ "ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow" })
PIXELS  = frozenset({ "yuv420p", "yuv422p", "yuv444p", "yuv420p10le", "nv12" })

DIRECT = 200 * 1024 * 1024

CLOUDFLARE = "https://api.cloudflare.com/client/v4"

BOUNDARY = "engine-video-upload"

MICRO    = 1_000_000
SECOND   = 1.0
SAMPLE   = 48000
CODECS   = "avc1.640028,mp4a.40.2"

@dataclass(frozen=True, slots=True)
class Asset:

    id       : str
    name     : str
    ready    : bool
    duration : float = 0.0
    size     : int = 0
    facts    : dict[str, Any] = field(default_factory=dict)

    def dump ( self ) -> dict[str, Any]:

        return {
            "id": self.id, "name": self.name, "ready": self.ready, "duration": self.duration, "size": self.size,
            **self.facts,
        }

@dataclass(frozen=True, slots=True)
class Playback:

    hls   : str
    dash  : str | None = None
    poster: str | None = None

    def dump ( self ) -> dict[str, str | None]:

        return { "hls": self.hls, "dash": self.dash, "poster": self.poster }

@dataclass(frozen=True, slots=True)
class Track:

    kind     : str
    codec    : str
    width    : int | None = None
    height   : int | None = None
    fps      : float | None = None
    bitrate  : int | None = None
    channels : int | None = None
    rate     : int | None = None
    language : str | None = None

    def dump ( self ) -> dict[str, Any]:

        return {
            "kind": self.kind, "codec": self.codec, "width": self.width, "height": self.height, "fps": self.fps,
            "bitrate": self.bitrate, "channels": self.channels, "rate": self.rate, "language": self.language,
        }

@dataclass(frozen=True, slots=True)
class Probe:

    duration : float
    format   : str
    bitrate  : int
    size     : int
    tracks   : tuple[Track, ...]

    def video ( self ) -> Track | None:

        return next((track for track in self.tracks if track.kind == "video"), None)

    def audio ( self ) -> Track | None:

        return next((track for track in self.tracks if track.kind == "audio"), None)

    def dump ( self ) -> dict[str, Any]:

        return {
            "duration": round(self.duration, 3), "format": self.format, "bitrate": self.bitrate, "size": self.size,
            "tracks": [track.dump() for track in self.tracks],
        }

@dataclass(frozen=True, slots=True)
class Preset:

    name      : str = "720p"
    codec     : str = "libx264"
    crf       : int = 23
    speed     : str = "veryfast"
    profile   : str = "high"
    pixel     : str = "yuv420p"
    width     : int | None = 1280
    height    : int | None = None
    fps       : float | None = None
    audio     : str = "aac"
    bitrate   : int = 128_000
    bandwidth : int = 2_800_000

    def __post_init__ ( self ) -> None:

        words: tuple[object, ...] = (self.name, self.codec, self.profile, self.audio)
        rate: object = self.fps

        if not all(self._worded_(word) for word in words): raise self._wrong_("name")
        if type(self.crf) is not int or not 0 <= self.crf <= CRF: raise self._wrong_("crf")
        if self.speed not in SPEEDS or self.pixel not in PIXELS: raise self._wrong_("speed")
        if not self._sized_(self.width): raise self._wrong_("width")
        if not self._sized_(self.height): raise self._wrong_("height")
        if rate is not None and (not isinstance(rate, int | float) or type(rate) is bool or not 0 < rate <= FASTEST):

            raise self._wrong_("fps")

        if type(self.bitrate) is not int or not LEAST <= self.bitrate <= MOST: raise self._wrong_("bitrate")
        if type(self.bandwidth) is not int or not LEAST <= self.bandwidth <= MOST * 10: raise self._wrong_("bandwidth")

    def dump ( self ) -> dict[str, Any]:

        facts = { "name": self.name, "codec": self.codec, "crf": self.crf, "width": self.width }

        return { **facts, "bandwidth": self.bandwidth }

    @staticmethod
    def _worded_ ( word: object ) -> bool:

        return type(word) is str and 0 < len(word) <= NAME and word.isprintable() and " " not in word

    @staticmethod
    def _sized_ ( value: object ) -> bool:

        return value is None or (type(value) is int and EVEN <= value <= WIDEST)

    @staticmethod
    def _wrong_ ( what: str ) -> Fault:

        return Fault(Code.INTERNAL, reason="video.preset", errors={ "preset": [what] })

RENDITIONS = (
    Preset("1080p", width=1920, crf=22, bandwidth=5_000_000),
    Preset("720p", width=1280, crf=23, bandwidth=2_800_000),
    Preset("480p", width=854, crf=24, bandwidth=1_400_000),
    Preset("360p", width=640, crf=26, bandwidth=800_000),
)
