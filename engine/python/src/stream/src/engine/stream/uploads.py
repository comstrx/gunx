from pathlib import Path
from typing import Any

from engine.date import date
from engine.error import Code, Fault
from engine.fs import dir, file
from .arch import LIMIT, NAME, Upload

class Uploads:

    def __init__ ( self, root: Path, limit: int = LIMIT ) -> None:

        self._root  = root
        self._limit = limit

    async def path ( self, id_: str ) -> Path:

        if not NAME.match(id_): raise Fault(Code.VALIDATION, reason="upload.id", errors={ "id": [id_[:64]] })

        return await file.under(self._root, f"{id_}.part")

    async def meta ( self, id_: str ) -> Path:

        return (await self.path(id_)).with_suffix(".json")

    async def start ( self, id_: str, size: int, name: str | None = None, media: str | None = None ) -> Upload:

        if size <= 0: raise Fault(Code.VALIDATION, reason="upload.size", errors={ "size": [str(size)] })
        if size > self._limit: raise Fault(Code.TOO_LARGE, reason="upload.limit", errors={ "size": [str(size)] })

        part = await self.path(id_)

        if await file.has(part): raise Fault(Code.CONFLICT, reason="upload.exists", errors={ "id": [id_] })

        facts = { "id": id_, "size": size, "name": name, "media": media, "started": date.iso() }

        await file.write(part, b"", durable=False)
        await file.write_json(part.with_suffix(".json"), facts)

        return Upload(id_, size, 0, name, media)

    async def status ( self, id_: str ) -> Upload:

        return await self._status_(id_, await self.path(id_))

    async def append ( self, id_: str, offset: int, data: bytes ) -> Upload:

        part    = await self.path(id_)
        current = await self._status_(id_, part)

        if offset != current.offset:

            headers = { "Upload-Offset": str(current.offset) }

            raise Fault(Code.CONFLICT, "The offset does not match", "upload.offset", headers=headers)

        if current.offset + len(data) > current.size:

            raise Fault(Code.TOO_LARGE, reason="upload.overflow", errors={ "size": [str(current.size)] })

        if data: await file.append(part, data)

        return Upload(id_, current.size, current.offset + len(data), current.name, current.media)

    async def finish ( self, id_: str, target: Path ) -> Path:

        part    = await self.path(id_)
        current = await self._status_(id_, part)

        if not current.done():

            detail = { "offset": [str(current.offset)] }

            raise Fault(Code.PRECONDITION_FAILED, reason="upload.incomplete", errors=detail)

        await file.move(part, target)
        await file.remove(part.with_suffix(".json"))

        return target

    async def abort ( self, id_: str ) -> bool:

        part = await self.path(id_)
        gone = await file.remove(part)

        await file.remove(part.with_suffix(".json"))

        return gone

    async def sweep ( self, older_than: float = 86400.0 ) -> int:

        swept = 0

        if not await dir.has(self._root): return swept

        for part in await dir.walk(self._root, ".part"):

            if await file.age(part) <= older_than: continue

            await file.remove(part)
            await file.remove(part.with_suffix(".json"))

            swept += 1

        return swept

    def describe ( self ) -> dict[str, Any]:

        return { "root": str(self._root), "limit": self._limit }

    async def _status_ ( self, id_: str, part: Path ) -> Upload:

        try: facts = dict(await file.read_json(part.with_suffix(".json")))
        except Fault as fault:

            if fault.code is not Code.NOT_FOUND: raise

            raise Fault(Code.NOT_FOUND, reason="upload.missing", errors={ "id": [id_] }) from fault

        return Upload(id_, int(facts["size"]), await file.size(part), facts.get("name"), facts.get("media"))
