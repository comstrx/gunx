from pathlib import Path
from typing import Any

from obstore.store import LocalStore, S3Store
from engine.error import Code, Fault
from engine.fs import path
from engine.log import log
from engine.net import Net, Remote
from engine.rand import rand
from engine.string import string
from .arch import FOLDER_NAME, GOOGLE, Policy, Stored
from .disk import Disk
from .drive import Drive

class Storage:

    def __init__ ( self ) -> None:

        self._disks: dict[str, Disk] = {}
        self._default: str | None = None
        self._policy = Policy()

    def setup ( self, disks: dict[str, Disk], default: str, policy: Policy | None = None ) -> None:

        held: object = policy
        given: object = disks

        if not isinstance(given, dict) or not all(isinstance(disk, Disk) for disk in given.values()):

            raise self._unset_("disks")
        if default not in disks: raise Fault(Code.INTERNAL, reason="storage.default")
        if held is not None and not isinstance(held, Policy): raise self._unset_("policy")

        self._disks   = dict(disks)
        self._default = default
        self._policy  = policy or Policy()

    def local ( self, name: str, root: Path, url: str | None = None, public: bool = False ) -> Disk:

        root.mkdir(parents=True, exist_ok=True)

        return Disk(name, LocalStore(str(root)), url, public)

    def s3 ( self, name: str, bucket: str, url: str | None = None, public: bool = False, **options: Any ) -> Disk:

        return Disk(name, S3Store(bucket, **options), url, public)

    def disk ( self, name: str | None = None ) -> Disk:

        chosen = name or self._default

        if chosen is None or chosen not in self._disks:

            raise Fault(Code.INTERNAL, reason="storage.disk", errors={ "disk": [chosen or ""] })

        return self._disks[chosen]

    def names ( self ) -> tuple[str, ...]:

        return tuple(sorted(self._disks))

    def policy ( self ) -> Policy:

        return self._policy

    def key ( self, name: str, folder: str = "uploads" ) -> str:

        if type(name) is not str or not name:

            raise Fault(Code.VALIDATION, reason="storage.type", errors={ "file": ["is invalid"] })
        if type(folder) is not str or not FOLDER_NAME.fullmatch(folder.strip("/")):

            raise Fault(Code.VALIDATION, reason="storage.folder")

        safe = path.safe(name)
        stem = string.slug(path.stem(safe))[:48] or "file"
        ext  = path.ext(safe)

        return f"{folder.strip('/')}/{rand.ulid().lower()}-{stem}{'.' + ext if ext else ''}"

    async def upload ( self, name: str, data: bytes, folder: str = "uploads", disk: str | None = None ) -> Stored:

        if not isinstance(data, bytes | bytearray): raise Fault(Code.VALIDATION, reason="storage.data")

        self._policy.check(name, len(data), bytes(data[:8]))

        stored = await self.disk(disk).put(self.key(name, folder), data)

        log.debug("storage.uploaded", disk=stored.disk, key=stored.key, size=stored.size)

        return stored

    async def close ( self ) -> None:

        self._disks = {}

    def describe ( self ) -> dict[str, object]:

        return { "disks": self.names(), "default": self._default, "max_size": self._policy.max_size }

    @staticmethod
    def _unset_ ( what: str ) -> Fault:

        return Fault(Code.INTERNAL, reason="storage.settings", errors={ "setting": [what] })

    def drive (
        self, net: Net, token: str, folder: str, name: str = "drive", url: str | None = None, public: bool = False,
    ) -> Drive:

        remote = Remote(net, GOOGLE, name="drive").bearer(token)

        return Drive(name, remote, folder, url, public)
