from dataclasses import dataclass, field
from typing import Any

from engine.error import Code, Fault
from engine.fs import path
import re

FIELDS  = "id,name,size,mimeType,parents"
FOLDER  = "application/vnd.google-apps.folder"
CHUNK   = 1024 * 1024

GOOGLE = "https://www.googleapis.com"

MAX_UPLOAD = 25 * 1024 * 1024
KEY        = 1_024
WEEK       = 7 * 86_400
FOLDER_NAME = re.compile(r"[A-Za-z0-9_-]{1,64}(?:/[A-Za-z0-9_-]{1,64}){0,7}")
NAME       = 64
IMAGES     = frozenset({ "png", "jpg", "jpeg", "webp", "gif", "avif", "svg" })
DOCUMENTS  = frozenset({ "pdf", "txt", "csv", "json", "xlsx", "docx" })
SIGNATURES = {
    b"\x89PNG"  : "png", b"\xff\xd8\xff": "jpg", b"GIF8": "gif", b"RIFF": "webp", b"%PDF": "pdf", b"PK\x03\x04": "zip",
}
ZIPPED     = frozenset({ "xlsx", "docx" })
ALIASES    = { "jpeg": "jpg" }
BLOCKED    = frozenset({ "exe", "sh", "bat", "php", "js", "html", "htm", "svgz" })

@dataclass(frozen=True, slots=True)
class Policy:

    max_size : int = MAX_UPLOAD
    allowed  : frozenset[str] = field(default_factory=lambda: IMAGES | DOCUMENTS)
    blocked  : frozenset[str] = BLOCKED

    def __post_init__ ( self ) -> None:

        kinds: tuple[object, object] = (self.allowed, self.blocked)

        if type(self.max_size) is not int or self.max_size < 1: raise Fault(Code.INTERNAL, reason="storage.policy")
        if not all(isinstance(kind, frozenset | set) and all(type(item) is str for item in kind) for kind in kinds):

            raise Fault(Code.INTERNAL, reason="storage.policy")

    def check ( self, name: str, size: int, head: bytes = b"" ) -> str:

        if type(name) is not str or not name or type(size) is not int or size < 0 or not isinstance(head, bytes):

            raise Fault(Code.VALIDATION, reason="storage.type", errors={ "file": ["is invalid"] })

        extension = path.ext(name)
        expected  = "zip" if extension in ZIPPED else ALIASES.get(extension, extension)
        sniffed   = self.sniff(head)

        if size > self.max_size: raise Fault(Code.TOO_LARGE, reason="storage.size", errors={ "file": [name] })

        if extension in self.blocked or extension not in self.allowed:

            message = f"{extension or 'unknown'} is not allowed"

            raise Fault(Code.VALIDATION, reason="storage.type", errors={ "file": [message] })

        if sniffed and sniffed != expected:

            message = f"content is {sniffed}, not {extension}"

            raise Fault(Code.VALIDATION, reason="storage.mismatch", errors={ "file": [message] })

        return extension

    def sniff ( self, head: bytes ) -> str | None:

        for magic, kind in SIGNATURES.items():

            if head.startswith(magic): return kind

        return None

@dataclass(frozen=True, slots=True)
class Stored:

    disk : str
    key  : str
    size : int
    url  : str | None

    def dump ( self ) -> dict[str, Any]:

        return { "disk": self.disk, "key": self.key, "size": self.size, "url": self.url }

def keyed ( key: object ) -> str:

    if type(key) is not str or not 0 < len(key) <= KEY or not key.isprintable(): raise unkeyed(key)
    if key.startswith(("/", "\\")) or "\\" in key or "\0" in key: raise unkeyed(key)
    if any(part in ("", ".", "..") for part in key.split("/")): raise unkeyed(key)

    return key

def unkeyed ( key: object ) -> Fault:

    return Fault(Code.VALIDATION, reason="storage.key", errors={ "key": [str(key)[:64]] })
