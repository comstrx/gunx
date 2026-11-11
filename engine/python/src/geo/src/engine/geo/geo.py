from collections.abc import Sequence
from typing import Any

from engine.adapter import Manager
from engine.error import Code, Fault
from engine.net import Remote
from .arch import BASE32, BITS, CHUNK, LAT, LNG, LONGEST, Place, Point, PRECISION, QUERY, RADIUS, REACH, real, TAG
from .geocoder import Geocoder
from .http import Http
from .memory import Memory
import math

class Geo:

    def __init__ ( self ) -> None:

        self._manager: Manager[Geocoder] = Manager("geo")

    def use ( self, geocoder: Geocoder, default: bool = True ) -> Geocoder:

        return self._manager.use(geocoder, default)

    def http ( self, remote: Remote ) -> Geocoder:

        return self.use(Http(remote))

    def memory ( self, places: Sequence[Place] = (), reach: float = REACH ) -> Geocoder:

        return self.use(Memory(places, reach))

    def point ( self, lat: float, lng: float ) -> Point:

        return Point(lat, lng)

    def distance ( self, a: Point, b: Point ) -> float:

        return a.distance(b)

    def bearing ( self, a: Point, b: Point ) -> float:

        la1, lo1, la2, lo2 = map(math.radians, (a.lat, a.lng, b.lat, b.lng))
        y = math.sin(lo2 - lo1) * math.cos(la2)
        x = math.cos(la1) * math.sin(la2) - math.sin(la1) * math.cos(la2) * math.cos(lo2 - lo1)

        return (math.degrees(math.atan2(y, x)) + 360) % 360

    def destination ( self, start: Point, bearing: float, meters: float ) -> Point:

        la1, lo1 = math.radians(start.lat), math.radians(start.lng)
        angle    = real(meters, "distance") / RADIUS
        heading  = math.radians(real(bearing, "bearing", 360.0))
        la2      = math.asin(math.sin(la1) * math.cos(angle) + math.cos(la1) * math.sin(angle) * math.cos(heading))
        y        = math.sin(heading) * math.sin(angle) * math.cos(la1)
        x        = math.cos(angle) - math.sin(la1) * math.sin(la2)
        lo2      = lo1 + math.atan2(y, x)

        return Point(math.degrees(la2), (math.degrees(lo2) + 540) % 360 - 180)

    def within ( self, point: Point, center: Point, meters: float ) -> bool:

        return self.distance(point, center) <= real(meters, "distance")

    def bounds ( self, points: Sequence[Point] ) -> tuple[Point, Point]:

        if not points: raise Fault(Code.VALIDATION, reason="geo.empty")

        low  = Point(min(p.lat for p in points), min(p.lng for p in points))
        high = Point(max(p.lat for p in points), max(p.lng for p in points))

        return low, high

    def center ( self, points: Sequence[Point] ) -> Point:

        low, high = self.bounds(points)

        return Point((low.lat + high.lat) / 2, (low.lng + high.lng) / 2)

    def geohash ( self, point: Point, precision: int = PRECISION ) -> str:

        if type(precision) is not int or not 1 <= precision <= LONGEST:

            raise Fault(Code.VALIDATION, reason="geo.precision")

        lat, lng = [-LAT, LAT], [-LNG, LNG]
        code: list[str] = []
        bits, even, char = 0, True, 0

        while len(code) < precision:

            side  = lng if even else lat
            value = point.lng if even else point.lat
            mid   = (side[0] + side[1]) / 2
            upper = value >= mid
            char  = char * 2 + (1 if upper else 0)

            side[0 if upper else 1] = mid

            even  = not even
            bits += 1

            if bits == BITS:

                code.append(BASE32[char])
                bits, char = 0, 0

        return "".join(code)

    def decode ( self, hashed: str ) -> Point:

        if type(hashed) is not str or not 1 <= len(hashed) <= LONGEST:

            raise Fault(Code.VALIDATION, reason="geo.geohash")

        lat, lng = [-LAT, LAT], [-LNG, LNG]
        even = True

        for ch in hashed:

            index = BASE32.find(ch)

            if index < 0: raise Fault(Code.VALIDATION, reason="geo.geohash")

            for mask in (16, 8, 4, 2, 1):

                side = lng if even else lat
                mid  = (side[0] + side[1]) / 2

                if index & mask: side[0] = mid
                else: side[1] = mid

                even = not even

        return Point((lat[0] + lat[1]) / 2, (lng[0] + lng[1]) / 2)

    def polyline ( self, points: Sequence[Point] ) -> str:

        out: list[str] = []
        last_lat = last_lng = 0

        for point in points:

            lat, lng = round(point.lat * 1e5), round(point.lng * 1e5)

            for delta in (lat - last_lat, lng - last_lng):

                value = ~(delta << 1) if delta < 0 else delta << 1

                while value >= CHUNK:

                    out.append(chr((CHUNK | (value & 0x1F)) + 63))
                    value >>= 5

                out.append(chr(value + 63))

            last_lat, last_lng = lat, lng

        return "".join(out)

    def link ( self, point: Point ) -> str:

        return f"https://maps.google.com/?q={point.lat:.6f},{point.lng:.6f}"

    async def geocode ( self, text: str, language: str = "en" ) -> list[Place]:

        if type(text) is not str or not 0 < len(text.strip()) <= QUERY: raise self._refuse_("query")

        return await self._manager.get().geocode(text.strip(), self._tag_(language))

    async def reverse ( self, point: Point, language: str = "en" ) -> Place | None:

        if not isinstance(point, Point): raise self._refuse_("point")

        return await self._manager.get().reverse(point, self._tag_(language))

    def _tag_ ( self, language: object ) -> str:

        if type(language) is not str or not 0 < len(language) <= TAG or not language.isascii():

            raise self._refuse_("language")

        return language

    @staticmethod
    def _refuse_ ( what: str ) -> Fault:

        return Fault(Code.VALIDATION, reason=f"geo.{what}")

    def describe ( self ) -> dict[str, Any]:

        return { "radius": RADIUS, **self._manager.describe() }
