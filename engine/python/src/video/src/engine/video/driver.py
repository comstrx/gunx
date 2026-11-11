from collections.abc import Mapping
from pathlib import Path
from typing import Any

from engine.adapter import Adapter
from engine.error import Code, Fault
from .arch import Asset, Playback

class Driver(Adapter):

    family       = "video"
    capabilities = frozenset({ "upload", "status", "playback", "delete" })

    async def upload ( self, source: Path, name: str, **options: Any ) -> Asset:

        raise Fault(Code.INTERNAL, reason="video.driver")

    async def status ( self, id_: str ) -> Asset:

        raise Fault(Code.INTERNAL, reason="video.driver")

    async def playback ( self, id_: str ) -> Playback:

        raise Fault(Code.INTERNAL, reason="video.driver")

    async def thumbnail ( self, id_: str, at: float = 1.0, width: int = 640 ) -> bytes | str:

        raise Fault(Code.INTERNAL, reason="video.driver")

    async def sign ( self, id_: str, seconds: int = 3600 ) -> str:

        raise Fault(Code.UNSUPPORTED_MEDIA, reason="video.capability", errors={ "capability": ["sign"] })

    async def delete ( self, id_: str ) -> bool:

        raise Fault(Code.INTERNAL, reason="video.driver")

    async def assets ( self, limit: int = 100 ) -> list[Asset]:

        raise Fault(Code.INTERNAL, reason="video.driver")

    def headers ( self ) -> Mapping[str, str]:

        return {}
