from dataclasses import dataclass, field
from typing import Any

from engine.error import Code, Fault
import math

RADIUS   = 6371008.8
LAT      = 90.0
LNG      = 180.0
BASE32   = "0123456789bcdefghjkmnpqrstuvwxyz"
PRECISION = 9
LONGEST   = 12
BITS      = 5
CHUNK     = 0x20
REACH     = 50_000.0
QUERY     = 512
TAG       = 16
MOST      = 1_000
NUMBER    = 32
FARTHEST  = 2 * math.pi * RADIUS

@dataclass(frozen=True, slots=True)
class Point:

    lat : float
    lng : float

    def __post_init__ ( self ) -> None:

        pair: tuple[object, object] = (self.lat, self.lng)
        real = all(isinstance(value, int | float) and type(value) is not bool for value in pair)

        if not real or not (-LAT <= self.lat <= LAT and -LNG <= self.lng <= LNG):

            raise Fault(Code.VALIDATION, reason="geo.point", errors={ "point": [f"{self.lat},{self.lng}"[:64]] })

        object.__setattr__(self, "lat", float(self.lat))
        object.__setattr__(self, "lng", float(self.lng))

    def distance ( self, other: Point ) -> float:

        la1, lo1, la2, lo2 = map(math.radians, (self.lat, self.lng, other.lat, other.lng))
        h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2

        return 2 * RADIUS * math.asin(math.sqrt(h))

    def dump ( self ) -> dict[str, float]:

        return { "lat": self.lat, "lng": self.lng }

@dataclass(frozen=True, slots=True)
class Place:

    point   : Point
    label   : str
    country : str | None = None
    city    : str | None = None
    raw     : dict[str, Any] = field(default_factory=dict)

    def __post_init__ ( self ) -> None:

        texts: tuple[object, ...] = (self.label, self.country, self.city)
        held: object = self.point
        raw: object = self.raw

        if not isinstance(held, Point) or type(self.label) is not str or not isinstance(raw, dict):

            raise Fault(Code.VALIDATION, reason="geo.place")

        if any(value is not None and type(value) is not str for value in texts[1:]):

            raise Fault(Code.VALIDATION, reason="geo.place")

    def dump ( self ) -> dict[str, Any]:

        return { **self.point.dump(), "label": self.label, "country": self.country, "city": self.city }

def real ( value: object, what: str, most: float = FARTHEST ) -> float:

    if isinstance(value, int | float) and type(value) is not bool and math.isfinite(value) and 0 <= value <= most:

        return float(value)

    raise Fault(Code.VALIDATION, reason=f"geo.{what}")
