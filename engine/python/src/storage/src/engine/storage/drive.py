from collections.abc import AsyncIterable, AsyncIterator, Sequence
from typing import Any, override

from engine.error import Code, Fault
from engine.json import json
from engine.net import Remote
from engine.rand import rand
from .arch import CHUNK, FIELDS, KEY, keyed, PART, Stored, unkeyed, WEEK
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

        if not isinstance(data, bytes | bytearray): raise Fault(Code.VALIDATION, reason="storage.data")

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
    async def upload (
        self, key: str, source: AsyncIterable[bytes], chunk: int = PART, concurrency: int = 2,
    ) -> Stored:

        raise Fault(Code.NOT_IMPLEMENTED, reason="storage.upload")

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

        return sorted([name async for name in self.scan(prefix)])

    @override
    async def scan ( self, prefix: str = "" ) -> AsyncIterator[str]:

        if type(prefix) is not str or len(prefix) > KEY or (prefix and not prefix.isprintable()): raise unkeyed(prefix)

        async for item in self._walk_(f"'{self._quoted_(self._folder)}' in parents and trashed = false"):

            name = str(item["name"])

            if name.startswith(prefix): yield name

    @override
    async def copy ( self, source: str, target: str ) -> None:

        keyed(target)

        found = await self._need_(source)

        copied = { "name": target, "parents": [self._folder] }

        await self._remote.post(f"/drive/v3/files/{found['id']}/copy", data=copied)

    @override
    async def sign ( self, key: str, seconds: int = 900 ) -> str:

        keyed(key)

        if type(seconds) is not int or not 0 < seconds <= WEEK:

            raise Fault(Code.VALIDATION, reason="storage.seconds")

        raise Fault(Code.NOT_IMPLEMENTED, reason="storage.sign")

    async def _files_ ( self, query: str ) -> Sequence[dict[str, Any]]:

        return [item async for item in self._walk_(query)]

    async def _walk_ ( self, query: str ) -> AsyncIterator[dict[str, Any]]:

        options: dict[str, Any] = { "q": query, "fields": f"nextPageToken,files({FIELDS})", "pageSize": 1000 }
        seen: set[str] = set()

        while True:

            body = await self._remote.get("/drive/v3/files", query=options)

            if not isinstance(body, dict) or not isinstance(body.get("files", []), list):

                raise Fault(Code.BAD_GATEWAY, reason="storage.response")

            for item in body.get("files", []):

                if not isinstance(item, dict): raise Fault(Code.BAD_GATEWAY, reason="storage.response")

                yield dict(item)

            token = body.get("nextPageToken")

            if not token: return
            if not isinstance(token, str) or token in seen:

                raise Fault(Code.BAD_GATEWAY, reason="storage.pagination")

            seen.add(token)
            options["pageToken"] = token

    async def _find_ ( self, key: str ) -> dict[str, Any] | None:

        keyed(key)

        safe  = self._quoted_(key)
        query = f"name = '{safe}' and '{self._quoted_(self._folder)}' in parents and trashed = false"
        items = await self._files_(query)

        return items[0] if items else None

    async def _need_ ( self, key: str ) -> dict[str, Any]:

        found = await self._find_(key)

        if found is None: raise Fault(Code.NOT_FOUND, reason="storage.missing", errors={ "key": [key] })

        return found

    @staticmethod
    def _quoted_ ( value: str ) -> str:

        return value.replace("\\", "\\\\").replace("'", "\\'")

    @staticmethod
    def _multipart_ ( boundary: str, meta: dict[str, Any], data: bytes ) -> bytes:

        head = f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n".encode() + json.encode(meta)
        file = f"\r\n--{boundary}\r\nContent-Type: application/octet-stream\r\n\r\n".encode()

        return head + file + data + f"\r\n--{boundary}--".encode()
