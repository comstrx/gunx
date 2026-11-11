from engine.geo import Geo, Place, Point
from engine.test import Bench
import asyncio

bench = Bench()
local = Geo()
loop  = asyncio.new_event_loop()
cairo = Point(30.0444, 31.2357)
giza  = Point(29.9792, 31.1342)
cloud = [Point(30 + at / 1000, 31 + at / 1000) for at in range(100)]
towns = [Place(Point(30 + at / 100, 31 + at / 100), f"Town {at}", "EG", f"City {at % 10}") for at in range(200)]

local.memory(towns, reach=5_000)

def building () -> None: Point(30.0444, 31.2357)

def distance () -> None: cairo.distance(giza)

def bearing () -> None: local.bearing(cairo, giza)

def destination () -> None: local.destination(cairo, 45.0, 1500.0)

def hashing () -> None: local.geohash(cairo)

def decoding () -> None: local.decode("stq4yvhfz")

def bounding () -> None: local.bounds(cloud)

def lining () -> None: local.polyline(cloud)

async def geocoding () -> None: await local.geocode("town 7")

async def reversing () -> None: await local.reverse(giza)

bench.measure("geo.point", building)
bench.measure("geo.distance", distance)
bench.measure("geo.bearing", bearing)
bench.measure("geo.destination", destination)
bench.measure("geo.geohash.9", hashing)
bench.measure("geo.decode.9", decoding)
bench.measure("geo.bounds.100", bounding, rounds=5000)
bench.measure("geo.polyline.100", lining, rounds=5000)
loop.run_until_complete(bench.measure_async("geo.memory.geocode.200", geocoding, rounds=2000))
loop.run_until_complete(bench.measure_async("geo.memory.reverse.200", reversing, rounds=2000))
loop.close()
