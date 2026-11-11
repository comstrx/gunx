from collections.abc import Iterator
from typing import BinaryIO

from engine.crypto import crypto
from engine.error import Code, Fault
from engine.thread import thread
from .arch import CHUNK, SEAL_FRAME, SEAL_LIMIT, SEAL_MAGIC, SEALED, Target
from .file import File
import io, pathlib, struct

class Encrypt:

    def __init__ ( self, file: File ) -> None:

        self._file = file

    async def has ( self, target: Target ) -> bool:

        return await self._file.starts(target, SEAL_MAGIC)

    async def seal ( self, source: Target, target: Target | None = None, aad: bytes = b"" ) -> pathlib.Path:

        origin = pathlib.Path(source)
        goal   = pathlib.Path(target) if target else origin.with_name(origin.name + SEALED)

        def go ( out: BinaryIO ) -> None:

            with origin.open("rb") as plain: self._seal_(plain, out, aad)

        await self._file.fill(goal, go)

        return goal

    async def open ( self, source: Target, target: Target | None = None, aad: bytes = b"" ) -> pathlib.Path:

        origin = pathlib.Path(source)
        goal   = pathlib.Path(target) if target else origin.with_name(origin.name.removesuffix(SEALED) or "plain")

        def go ( out: BinaryIO ) -> None:

            with origin.open("rb") as sealed: out.writelines(self._open_(sealed, aad, origin.name))

        await self._file.fill(goal, go)

        return goal

    async def write ( self, target: Target, data: bytes | str, aad: bytes = b"" ) -> int:

        raw = data.encode() if isinstance(data, str) else data

        return await self._file.fill(target, lambda out: self._seal_(io.BytesIO(raw), out, aad))

    async def read ( self, target: Target, aad: bytes = b"" ) -> bytes:

        held = await self._file.read(target)
        name = self._file.name(target)

        return await thread.offload(lambda: b"".join(self._open_(io.BytesIO(held), aad, name)))

    def _seal_ ( self, plain: BinaryIO, out: BinaryIO, aad: bytes ) -> None:

        out.write(SEAL_MAGIC)

        index = 0
        piece = plain.read(CHUNK)

        while True:

            ahead = plain.read(CHUNK)
            frame = crypto.seal_bytes(piece, aad + struct.pack(">Q?", index, not ahead))

            out.write(struct.pack(">I", len(frame)))
            out.write(frame)

            if not ahead: return

            index, piece = index + 1, ahead

    def _open_ ( self, sealed: BinaryIO, aad: bytes, name: str ) -> Iterator[bytes]:

        if sealed.read(len(SEAL_MAGIC)) != SEAL_MAGIC: raise self._refuse_(name)

        index = 0
        head  = sealed.read(SEAL_FRAME)

        while True:

            if len(head) != SEAL_FRAME: raise self._refuse_(name)

            size = struct.unpack(">I", head)[0]

            if size > SEAL_LIMIT: raise self._refuse_(name)

            frame = sealed.read(size)
            head  = sealed.read(SEAL_FRAME)

            if len(frame) != size: raise self._refuse_(name)

            yield crypto.open_bytes(frame, aad + struct.pack(">Q?", index, not head))

            if not head: return

            index += 1

    def _refuse_ ( self, name: str ) -> Fault:

        return Fault(Code.BAD_REQUEST, "Cannot open the sealed file", "fs.sealed", { "path": [name[:64]] })
