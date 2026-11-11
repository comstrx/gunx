from collections.abc import Sequence
from typing import override

from engine.error import Code, Fault
from .arch import Place, Point, REACH, real
from .geocoder import Geocoder

class Memory(Geocoder):

    name = "memory"

    def __init__ ( self, places: Sequence[Place] = (), reach: float = REACH ) -> None:

        held: object = places

        if not isinstance(held, list | tuple) or not all(isinstance(place, Place) for place in held):

            raise Fault(Code.INTERNAL, reason="geo.settings", errors={ "setting": ["places"] })

        self._places = tuple(held)
        self._reach  = real(reach, "settings")

    @override
    async def geocode ( self, text: str, language: str = "en" ) -> list[Place]:

        wanted = text.strip().casefold()

        if not wanted: return []

        return [place for place in self._places if wanted in self._words_(place)]

    @override
    async def reverse ( self, point: Point, language: str = "en" ) -> Place | None:

        ranked = sorted(self._places, key=lambda place: point.distance(place.point))

        return ranked[0] if ranked and point.distance(ranked[0].point) <= self._reach else None

    def _words_ ( self, place: Place ) -> str:

        return " ".join(part for part in (place.label, place.city or "", place.country or "") if part).casefold()
