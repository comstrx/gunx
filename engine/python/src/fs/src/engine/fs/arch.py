from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime as DateTime
from typing import Any

from compression import zstd
from engine.date import date
from PIL import Image as Pil
import asyncio, bz2, gzip, lzma, os, pathlib, tarfile, zipfile, zlib

type Target  = str | os.PathLike[str]
type Reader  = Callable[[pathlib.Path, int], Awaitable[bytes]]
type Watcher = Callable[[pathlib.Path, bool, float, asyncio.Event | None], AsyncIterator[list[Change]]]

MAX_READ = 64 * 1024 * 1024
CHUNK    = 1024 * 1024
HEAD     = 512
NAME_MAX = 128
LOCK_TICK = 0.02
FOLLOW    = 0.25
STAMP     = "%Y%m%d-%H%M%S"
BACKUP    = f"{'[0-9]' * 8}-{'[0-9]' * 6}"
MODE_FILE = 0o600
MODE_DIR  = 0o700
ACCESS   = { "r": os.R_OK, "w": os.W_OK, "x": os.X_OK }
UNSAFE   = frozenset({ "", ".", ".." })
MAGIC    = (
    (b"\x89PNG", "image/png"), (b"\xff\xd8\xff", "image/jpeg"), (b"GIF8", "image/gif"), (b"RIFF", "image/webp"),
    (b"%PDF", "application/pdf"), (b"PK\x03\x04", "application/zip"), (b"\x1f\x8b", "application/gzip"),
    (b"\x28\xb5\x2f\xfd", "application/zstd"), (b"\xfd7zXZ", "application/x-xz"), (b"BZh", "application/x-bzip2"),
    (b"ID3", "audio/mpeg"), (b"OggS", "audio/ogg"), (b"\x7fELF", "application/x-executable"),
    (b"EFS2", "application/x-sealed"),
)

PACK_MAX = 1024 * 1024 * 1024
PACK_ITEMS = 100_000
RATIO    = 200
SUFFIXES = { "gzip": ".gz", "zstd": ".zst", "xz": ".xz", "bz2": ".bz2" }
OPENERS: dict[str, Callable[..., Any]] = { "gzip": gzip.open, "zstd": zstd.open, "xz": lzma.open, "bz2": bz2.open }
LEVELS   = { "gzip": "compresslevel", "zstd": "level", "xz": "preset", "bz2": "compresslevel" }
TARS: dict[str, str] = {
    ".tar": "w", ".tar.gz": "w:gz", ".tgz": "w:gz", ".tar.zst": "w:zst", ".tar.xz": "w:xz", ".tar.bz2": "w:bz2",
}

SEAL_MAGIC = b"EFS2"
SEAL_FRAME = 4
SEAL_LIMIT = 8 * 1024 * 1024
SEALED     = ".sealed"

PIXELS  = 50_000_000
QUALITY = 85
BEST    = 100
FORMATS = frozenset({ "jpeg", "png", "webp", "gif", "avif" })
ALIASES = { "jpg": "jpeg", "jpe": "jpeg" }
MEDIA   = { "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp", "gif": "image/gif", "avif": "image/avif" }
SIGNS   = ((b"\xff\xd8\xff", "jpeg"), (b"\x89PNG\r\n\x1a\n", "png"), (b"GIF87a", "gif"), (b"GIF89a", "gif"))
OPAQUE  = frozenset({ "jpeg" })
SWATCH  = 16

EVENTS = { 1: "added", 2: "modified", 3: "deleted" }
STAGED = ".part"

BROKEN = (zipfile.BadZipFile, tarfile.TarError, lzma.LZMAError, zstd.ZstdError, zlib.error, EOFError, ValueError)

@dataclass(frozen=True, slots=True)
class Info:

    path     : pathlib.Path
    kind     : str
    size     : int
    mode     : int
    owner    : int
    group    : int
    inode    : int
    links    : int
    modified : DateTime
    created  : DateTime
    accessed : DateTime

    def name ( self ) -> str:

        return self.path.name

    def suffix ( self ) -> str:

        return self.path.suffix.lower().lstrip(".")

    def dump ( self ) -> dict[str, Any]:

        return {
            "path": str(self.path), "kind": self.kind, "size": self.size, "mode": oct(self.mode & 0o777),
            "owner": self.owner, "group": self.group, "inode": self.inode, "links": self.links,
            "modified": date.iso(self.modified), "created": date.iso(self.created), "accessed": date.iso(self.accessed),
        }

@dataclass(frozen=True, slots=True)
class Change:

    kind : str
    path : pathlib.Path

    def dump ( self ) -> dict[str, str]:

        return { "kind": self.kind, "path": str(self.path) }

@dataclass(frozen=True, slots=True)
class Picture:

    raw    : Pil.Image
    format : str

    @property
    def width ( self ) -> int:

        return int(self.raw.width)

    @property
    def height ( self ) -> int:

        return int(self.raw.height)

    @property
    def mode ( self ) -> str:

        return str(self.raw.mode)

    def pixels ( self ) -> int:

        return self.width * self.height

    def dump ( self ) -> dict[str, Any]:

        return { "width": self.width, "height": self.height, "mode": self.mode, "format": self.format }
