from typing import ClassVar

from engine.adapter import Adapter
from engine.error import Code, Fault
from .arch import Place, Point

class Geocoder(Adapter):

    family       : ClassVar[str] = "geo"
    capabilities : ClassVar[frozenset[str]] = frozenset({ "geocode", "reverse" })

    async def geocode ( self, text: str, language: str = "en" ) -> list[Place]:

        raise Fault(Code.INTERNAL, reason="geo.abstract")

    async def reverse ( self, point: Point, language: str = "en" ) -> Place | None:

        raise Fault(Code.INTERNAL, reason="geo.abstract")
