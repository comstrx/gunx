from pathlib import Path
from typing import Any, override

from engine.error import Code, Fault
from engine.fs import file
from engine.net import Remote
from .arch import Asset, BOUNDARY, DIRECT, Playback
from .driver import Driver

class Cloudflare(Driver):

    name         = "cloudflare"
    capabilities = frozenset({ "upload", "status", "playback", "delete", "sign", "thumbnail", "list" })

    def __init__ ( self, remote: Remote, account: str, customer: str ) -> None:

        self.need(account=account, customer=customer)

        self._remote   = remote
        self._account  = account
        self._customer = customer

    @override
    async def upload ( self, source: Path, name: str, **options: Any ) -> Asset:

        size = await file.size(source)

        if size > DIRECT: raise Fault(Code.TOO_LARGE, reason="video.size", errors={ "file": [name] })

        data  = await file.read(source, DIRECT)
        reply = await self._remote.call(
            "POST", self._path_(), body=self._multipart_(name, data, options.get("media", "video/mp4")),
            headers={ "Content-Type": f"multipart/form-data; boundary={BOUNDARY}" },
        )

        return self._asset_(self._result_(reply.json()))

    @override
    async def status ( self, id_: str ) -> Asset:

        return self._asset_(self._result_(await self._remote.get(self._path_(id_))))

    @override
    async def playback ( self, id_: str ) -> Playback:

        base = f"https://{self._customer}.cloudflarestream.com/{id_}"

        return Playback(f"{base}/manifest/video.m3u8", f"{base}/manifest/video.mpd", f"{base}/thumbnails/thumbnail.jpg")

    @override
    async def thumbnail ( self, id_: str, at: float = 1.0, width: int = 640 ) -> str:

        return f"https://{self._customer}.cloudflarestream.com/{id_}/thumbnails/thumbnail.jpg?time={at:g}s&width={width}"

    @override
    async def sign ( self, id_: str, seconds: int = 3600 ) -> str:

        body = await self._remote.post(f"{self._path_(id_)}/token", data={ "exp": seconds })

        return str(self._result_(body)["token"])

    @override
    async def delete ( self, id_: str ) -> bool:

        reply = await self._remote.call("DELETE", self._path_(id_))

        return reply.ok()

    @override
    async def assets ( self, limit: int = 100 ) -> list[Asset]:

        body = await self._remote.get(self._path_(), query={ "limit": limit })

        return [self._asset_(item) for item in self._result_(body, many=True)]

    def _path_ ( self, id_: str | None = None ) -> str:

        return f"/accounts/{self._account}/stream" + (f"/{id_}" if id_ else "")

    @staticmethod
    def _result_ ( body: Any, many: bool = False ) -> Any:

        if not isinstance(body, dict) or not body.get("success", True):

            raise Fault(Code.UNAVAILABLE, reason="video.cloudflare", unknown=True)

        found = body.get("result")

        return list(found or []) if many else dict(found or {})

    @staticmethod
    def _asset_ ( item: dict[str, Any] ) -> Asset:

        status = item.get("status") or {}
        ready  = item.get("readyToStream", status.get("state") == "ready")

        return Asset(
            str(item.get("uid", "")), str((item.get("meta") or {}).get("name") or item.get("uid", "")), bool(ready),
            float(item.get("duration") or 0.0), int(item.get("size") or 0),
            { "state": status.get("state"), "preview": item.get("preview"), "created": item.get("created") },
        )

    @staticmethod
    def _multipart_ ( name: str, data: bytes, media: str ) -> bytes:

        head = (
            f'--{BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\n'
            f"Content-Type: {media}\r\n\r\n"
        ).encode()

        return head + data + f"\r\n--{BOUNDARY}--\r\n".encode()
