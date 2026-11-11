from pathlib import Path
from typing import Any, override

from engine.error import Code, Fault
from engine.fs import dir
from engine.rand import rand
from engine.storage import Storage
from .arch import Asset, Playback
from .driver import Driver

class Local(Driver):

    name         = "local"
    capabilities = frozenset({ "upload", "status", "playback", "delete", "thumbnail", "list" })

    def __init__ ( self, videos: Any, storage: Storage, folder: str = "videos", disk: str | None = None ) -> None:

        self._videos  = videos
        self._storage = storage
        self._folder  = folder.strip("/")
        self._disk    = disk
        self._assets: dict[str, Asset] = {}

    @override
    async def upload ( self, source: Path, name: str, **options: Any ) -> Asset:

        id_   = rand.ulid().lower()
        work  = await dir.temp(prefix="engine-video-") / id_
        probe = await self._videos.probe(source)

        chosen = { key: value for key, value in options.items() if key in ("renditions", "segment") }

        await self._videos.hls(source, work, **chosen)
        await self._videos.publish(work, self._storage, f"{self._folder}/{id_}", self._disk)

        poster = await self._videos.thumbnail(source, min(1.0, probe.duration / 2))

        await self._storage.disk(self._disk).put(f"{self._folder}/{id_}/poster.webp", poster)
        await dir.remove(work.parent)

        asset = Asset(id_, name, ready=True, duration=probe.duration, size=probe.size, facts={ "format": probe.format })

        self._assets[id_] = asset

        return asset

    @override
    async def status ( self, id_: str ) -> Asset:

        found = self._assets.get(id_)

        if found is None:

            if not await self._storage.disk(self._disk).exists(f"{self._folder}/{id_}/master.m3u8"):

                raise Fault(Code.NOT_FOUND, reason="video.missing", errors={ "id": [id_] })

            found = Asset(id_, id_, ready=True)

        return found

    @override
    async def playback ( self, id_: str ) -> Playback:

        disk   = self._storage.disk(self._disk)
        base   = f"{self._folder}/{id_}"
        master = disk.url(f"{base}/master.m3u8") or f"{base}/master.m3u8"
        poster = disk.url(f"{base}/poster.webp") or f"{base}/poster.webp"

        return Playback(master, None, poster)

    @override
    async def thumbnail ( self, id_: str, at: float = 1.0, width: int = 640 ) -> bytes:

        return await self._storage.disk(self._disk).get(f"{self._folder}/{id_}/poster.webp")

    @override
    async def delete ( self, id_: str ) -> bool:

        disk  = self._storage.disk(self._disk)
        keys  = await disk.list(f"{self._folder}/{id_}/")

        for key in keys: await disk.delete(key)

        self._assets.pop(id_, None)

        return bool(keys)

    @override
    async def assets ( self, limit: int = 100 ) -> list[Asset]:

        return list(self._assets.values())[:limit]
