from collections.abc import Awaitable
from typing import Any, override

from engine.error import Code, Fault
from engine.net import Remote
from .arch import MOST, NUMBER, Place, Point
from .geocoder import Geocoder

class Http(Geocoder):

    name = "http"

    def __init__ ( self, remote: Remote ) -> None:

        held: object = remote

        if not isinstance(held, Remote):

            raise Fault(Code.INTERNAL, reason="geo.settings", errors={ "setting": ["remote"] })

        self._remote = remote

    @override
    async def geocode ( self, text: str, language: str = "en" ) -> list[Place]:

        body = await self._ask_(self._remote.get("/geocode", query={ "q": text, "language": language }))

        if not isinstance(body, list): raise self._broken_()

        return [self._place_(item) for item in body[:MOST]]

    @override
    async def reverse ( self, point: Point, language: str = "en" ) -> Place | None:

        query = { "lat": point.lat, "lng": point.lng, "language": language }
        body  = await self._ask_(self._remote.get("/reverse", query=query))

        if body is None or body == {}: return None

        return self._place_(body)

    async def _ask_ ( self, work: Awaitable[Any] ) -> Any:

        try: return await work
        except Fault as fault:

            if not fault.client(): raise

            raise Fault(Code.BAD_GATEWAY, reason="geo.provider", errors={ "provider": [fault.reason or ""] }) from fault

    def _place_ ( self, item: Any ) -> Place:

        if not isinstance(item, dict): raise self._broken_()

        try: point = Point(self._number_(item.get("lat")), self._number_(item.get("lng")))
        except Fault as error: raise self._broken_() from error

        label, country, city = item.get("label", ""), item.get("country"), item.get("city")
        named = (country if country is None else str(country), city if city is None else str(city))

        try: return Place(point, str(label), named[0], named[1], dict(item))
        except Fault as error: raise self._broken_() from error

    def _number_ ( self, value: object ) -> float:

        if isinstance(value, int | float) and type(value) is not bool: return float(value)
        if type(value) is not str or len(value) > NUMBER: raise self._broken_()

        try: return float(value)
        except ValueError as error: raise self._broken_() from error

    @staticmethod
    def _broken_ () -> Fault:

        return Fault(Code.UNAVAILABLE, reason="geo.reply", unknown=True)
