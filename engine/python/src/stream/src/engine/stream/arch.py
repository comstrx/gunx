from collections.abc import AsyncIterator
from dataclasses import dataclass
from http import HTTPStatus
from typing import Any

import re

CHUNK   = 256 * 1024
LEAST   = 1024
MEDIA   = "application/octet-stream"
PATTERN = re.compile(r"^bytes=(\d*)-(\d*)$")
OK      = 200
PARTIAL = 206
SAME    = 304
BAD     = HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE

NAME  = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
LIMIT = 1 << 30

@dataclass(frozen=True, slots=True)
class Segment:

    uri           : str
    duration      : float
    discontinuity : bool = False
    byterange     : tuple[int, int] | None = None

    def dump ( self ) -> dict[str, Any]:

        facts = { "uri": self.uri, "duration": self.duration, "discontinuity": self.discontinuity }

        return { **facts, "byterange": self.byterange }

@dataclass(frozen=True, slots=True)
class Variant:

    uri        : str
    bandwidth  : int
    resolution : str | None = None
    codecs     : str | None = None
    frame_rate : float | None = None

@dataclass(frozen=True, slots=True)
class Representation:

    id        : str
    bandwidth : int
    width     : int
    height    : int
    codecs    : str = "avc1.64001f"
    mime      : str = "video/mp4"
    init      : str = "init-$RepresentationID$.m4s"
    media     : str = "chunk-$RepresentationID$-$Number%05d$.m4s"

@dataclass(frozen=True, slots=True)
class Served:

    status  : int
    headers : dict[str, str]
    media   : str
    body    : AsyncIterator[bytes] | None
    length  : int

    def partial ( self ) -> bool:

        return self.status == PARTIAL

    def dump ( self ) -> dict[str, Any]:

        return { "status": self.status, "headers": self.headers, "media": self.media, "length": self.length }

@dataclass(frozen=True, slots=True)
class Upload:

    id     : str
    size   : int
    offset : int
    name   : str | None = None
    media  : str | None = None

    def done ( self ) -> bool:

        return self.offset >= self.size

    def remaining ( self ) -> int:

        return max(0, self.size - self.offset)

    def dump ( self ) -> dict[str, Any]:

        facts = { "id": self.id, "size": self.size, "offset": self.offset, "name": self.name, "media": self.media }

        return { **facts, "done": self.done() }
