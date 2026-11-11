from collections.abc import AsyncIterator, Sequence
from typing import Any, override

from engine.error import Code, Fault
from engine.json import json
from engine.net import Remote
from engine.rand import rand
from .arch import CHUNK, FIELDS, Stored
from .disk import Disk

class Drive(Disk):

    def __init__ (
        self, name: str, remote: Remote, folder: str, url: str | None = None, public: bool = False,
    ) -> None:

        super().__init__(name, None, url, public)

        self._remote = remote
        self._folder = folder

    @override
    async def put ( self, key: str, data: bytes ) -> Stored:

        found    = await self._find_(key)
        boundary = f"engine-{rand.hex(12)}"
        meta     = { "name": key } if found else { "name": key, "parents": [self._folder] }
        body     = self._multipart_(boundary, meta, data)
        headers  = { "Content-Type": f"multipart/related; boundary={boundary}" }

        method = "PATCH" if found else "POST"
        path   = f"/upload/drive/v3/files/{found['id']}" if found else "/upload/drive/v3/files"

        await self._remote.call(method, path, query={ "uploadType": "multipart" }, body=body, headers=headers)

        return Stored(self.name, key, len(data), self.url(key))

    @override
    async def get ( self, key: str ) -> bytes:

        found = await self._need_(key)
        reply = await self._remote.call("GET", f"/drive/v3/files/{found['id']}", query={ "alt": "media" })

        return reply.body

    @override
    async def stream ( self, key: str, chunk: int = CHUNK ) -> AsyncIterator[bytes]:

        found = await self._need_(key)

        path = f"/drive/v3/files/{found['id']}"

        async for piece in self._remote.stream("GET", path, query={ "alt": "media" }, chunk=chunk): yield piece

    @override
    async def exists ( self, key: str ) -> bool:

        return await self._find_(key) is not None

    @override
    async def size ( self, key: str ) -> int:

        return int((await self._need_(key)).get("size") or 0)

    @override
    async def delete ( self, key: str ) -> bool:

        found = await self._find_(key)

        if found is None: return False

        await self._remote.call("DELETE", f"/drive/v3/files/{found['id']}")

        return True

    @override
    async def list ( self, prefix: str = "" ) -> list[str]:

        items = await self._files_(f"'{self._folder}' in parents and trashed = false")
        names = [str(item["name"]) for item in items]

        return sorted(name for name in names if name.startswith(prefix))

    @override
    async def copy ( self, source: str, target: str ) -> None:

        found = await self._need_(source)

        copied = { "name": target, "parents": [self._folder] }

        await self._remote.post(f"/drive/v3/files/{found['id']}/copy", data=copied)

    @override
    async def sign ( self, key: str, seconds: int = 900 ) -> str:

        found = await self._need_(key)

        return f"https://drive.google.com/uc?id={found['id']}&export=download"

    async def _files_ ( self, query: str ) -> Sequence[dict[str, Any]]:

        query_ = { "q": query, "fields": f"files({FIELDS})", "pageSize": 1000 }
        body   = await self._remote.get("/drive/v3/files", query=query_)

        return [dict(item) for item in body.get("files", [])] if isinstance(body, dict) else []

    async def _find_ ( self, key: str ) -> dict[str, Any] | None:

        safe  = key.replace("\\", "\\\\").replace("'", "\\'")
        items = await self._files_(f"name = '{safe}' and '{self._folder}' in parents and trashed = false")

        return items[0] if items else None

    async def _need_ ( self, key: str ) -> dict[str, Any]:

        found = await self._find_(key)

        if found is None: raise Fault(Code.NOT_FOUND, reason="storage.missing", errors={ "key": [key] })

        return found

    @staticmethod
    def _multipart_ ( boundary: str, meta: dict[str, Any], data: bytes ) -> bytes:

        head = f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n".encode() + json.encode(meta)
        file = f"\r\n--{boundary}\r\nContent-Type: application/octet-stream\r\n\r\n".encode()

        return head + file + data + f"\r\n--{boundary}--".encode()
