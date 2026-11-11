from engine.error import Code, Fault
from aiohttp import web
from engine.geo import Geo, Place, Point, geo
from engine.net import Egress, Remote, net
from typing import Any, cast
import pytest

FLAG: Any = True

def test_distances_bearings_hashes_and_lines () -> None:

    cairo  = geo.point(30.0444, 31.2357)
    riyadh = Point(24.7136, 46.6753)

    assert round(geo.distance(cairo, riyadh) / 1000) == 1634 and round(geo.bearing(cairo, riyadh)) == 108
    assert geo.within(cairo, Point(30.05, 31.24), 2000) and not geo.within(cairo, riyadh, 2000)

    moved = geo.destination(cairo, 90, 1000)

    assert abs(moved.lat - cairo.lat) < 1e-4 and moved.lng > cairo.lng and round(geo.distance(cairo, moved)) == 1000

    low, high = geo.bounds([cairo, riyadh])

    assert (low.lat, high.lng) == (24.7136, 46.6753) and geo.center([cairo, riyadh]).lat == pytest.approx(27.379, abs=1e-3)
    assert geo.geohash(cairo, 6) == "stq4yv" and geo.decode("stq4yv").lat == pytest.approx(30.044, abs=0.01)
    assert geo.polyline([Point(38.5, -120.2), Point(40.7, -120.95), Point(43.252, -126.453)]) == "_p~iF~ps|U_ulLnnqC_mqNvxq`@"
    assert geo.link(cairo) == "https://maps.google.com/?q=30.044400,31.235700" and cairo.dump() == { "lat": 30.0444, "lng": 31.2357 }

    with pytest.raises(Fault) as bad: Point(91, 0)

    assert bad.value.code is Code.VALIDATION and bad.value.reason == "geo.point"

    with pytest.raises(Fault): geo.bounds([])
    with pytest.raises(Fault): geo.decode("a!")

async def test_geocoding_needs_a_provider () -> None:

    with pytest.raises(Fault) as none: await geo.geocode("Cairo")

    assert none.value.reason == "geo.adapter"
    assert geo.describe()["radius"] > 6_000_000

async def test_memory_geocoder_finds_and_reverses_within_reach () -> None:

    local  = Geo()
    cairo  = Place(Point(30.0444, 31.2357), "Cairo Tower", "EG", "Cairo")
    riyadh = Place(Point(24.7136, 46.6753), "Kingdom Tower", "SA", "Riyadh")

    local.memory([cairo, riyadh], reach=5_000)

    assert await local.geocode("cairo") == [cairo] and await local.geocode(" CAIRO ") == [cairo]

    with pytest.raises(Fault) as blank: await local.geocode("  ")

    assert blank.value.reason == "geo.query"
    assert await local.reverse(Point(30.05, 31.24)) == cairo and await local.reverse(Point(0.0, 0.0)) is None

async def test_the_surface_refuses_what_no_map_could_hold () -> None:

    local = Geo()
    cairo = Point(30.0444, 31.2357)

    local.memory([Place(cairo, "Cairo")])

    for reason, make in (
        ("geo.point", lambda: Point(cast("Any", "30"), 31)), ("geo.point", lambda: Point(30, cast("Any", None))), ("geo.point", lambda: Point(FLAG, 0)),
        ("geo.point", lambda: Point(float("nan"), 0)), ("geo.point", lambda: Point(0, float("inf"))), ("geo.point", lambda: Point(-91, 0)), ("geo.point", lambda: Point(0, 181)),
        ("geo.place", lambda: Place(cast("Any", (1, 2)), "x")), ("geo.place", lambda: Place(cairo, cast("Any", 7))), ("geo.place", lambda: Place(cairo, "x", cast("Any", 1))),
        ("geo.place", lambda: Place(cairo, "x", raw=cast("Any", []))),
        ("geo.precision", lambda: local.geohash(cairo, 0)), ("geo.precision", lambda: local.geohash(cairo, 13)), ("geo.precision", lambda: local.geohash(cairo, cast("Any", 6.0))),
        ("geo.geohash", lambda: local.decode("")), ("geo.geohash", lambda: local.decode("s" * 13)), ("geo.geohash", lambda: local.decode(cast("Any", 7))), ("geo.geohash", lambda: local.decode("stq4yv!")),
        ("geo.distance", lambda: local.within(cairo, cairo, -1)), ("geo.distance", lambda: local.within(cairo, cairo, float("nan"))), ("geo.distance", lambda: local.destination(cairo, 90, float("inf"))),
        ("geo.distance", lambda: local.destination(cairo, 90, cast("Any", "1"))), ("geo.bearing", lambda: local.destination(cairo, 361, 10)), ("geo.bearing", lambda: local.destination(cairo, -1, 10)),
        ("geo.settings", lambda: local.memory(cast("Any", "places"))), ("geo.settings", lambda: local.memory([cast("Any", "x")])), ("geo.settings", lambda: local.memory([], reach=-1)),
        ("geo.settings", lambda: local.http(cast("Any", "http://x"))),
    ):

        with pytest.raises(Fault) as refused: make()

        assert refused.value.reason == reason, reason

    assert Point(30, 31).lat == 30.0 and type(Point(30, 31).lng) is float and Place(cairo, "Cairo").dump() == { "lat": 30.0444, "lng": 31.2357, "label": "Cairo", "country": None, "city": None }
    assert len(local.geohash(cairo, 12)) == 12 and len(local.geohash(cairo, 1)) == 1 and local.distance(local.destination(cairo, 0, 0), cairo) < 1e-6

    for reason, work in (
        ("geo.query", local.geocode("")), ("geo.query", local.geocode("x" * 513)), ("geo.query", local.geocode(cast("Any", None))),
        ("geo.language", local.geocode("cairo", "")), ("geo.language", local.geocode("cairo", "x" * 17)), ("geo.language", local.geocode("cairo", "عربي")),
        ("geo.point", local.reverse(cast("Any", (30, 31)))), ("geo.language", local.reverse(cairo, cast("Any", 7))),
    ):

        with pytest.raises(Fault) as wrong: await work

        assert wrong.value.reason == reason, reason

async def test_the_http_geocoder_hides_a_broken_or_hostile_provider () -> None:

    answers: list[Any] = []

    async def handle ( request: web.Request ) -> web.Response:

        answer = answers.pop(0)

        if isinstance(answer, int): return web.Response(status=answer)

        return web.json_response(answer)

    app = web.Application()

    app.router.add_route("*", "/{tail:.*}", handle)

    runner = web.AppRunner(app)

    await runner.setup()
    await web.TCPSite(runner, "127.0.0.1", 0).start()

    port  = int(runner.addresses[0][1])
    local = Geo()

    local.http(Remote(net, f"http://127.0.0.1:{port}", {}, Egress(allow_private=True, ports=frozenset())))

    answers.extend([
        [{ "lat": 30.0444, "lng": 31.2357, "label": "Cairo", "country": "EG", "city": 7 }], { "lat": "24.7", "lng": "46.6" }, {}, None,
    ])

    found = await local.geocode("cairo", "ar")

    assert found == [Place(Point(30.0444, 31.2357), "Cairo", "EG", "7", found[0].raw)] and found[0].raw["city"] == 7
    assert await local.reverse(Point(24, 46)) == Place(Point(24.7, 46.6), "", None, None, { "lat": "24.7", "lng": "46.6" })
    assert await local.reverse(Point(0, 0)) is None and await local.reverse(Point(0, 0)) is None

    for reason, answer, forward in (
        ("geo.reply", { "lat": 1 }, False), ("geo.reply", [{ "lat": 91, "lng": 0 }], True), ("geo.reply", ["x"], True), ("geo.reply", [{ "lat": "x", "lng": 0 }], True),
        ("geo.reply", "text", True), ("geo.reply", 7.5, True), ("geo.reply", { "lat": "1" * 40, "lng": 0 }, False), ("geo.reply", [1], False),
        ("geo.provider", 404, True), ("geo.provider", 400, True), ("geo.provider", 429, False),
    ):

        answers.append(answer)

        with pytest.raises(Fault) as broken: await (local.geocode("x") if forward else local.reverse(Point(0, 0)))

        assert broken.value.reason == reason and broken.value.server(), (reason, answer)

    answers.append(500)

    with pytest.raises(Fault) as down: await local.geocode("x")

    assert down.value.code is Code.UNAVAILABLE and down.value.reason == "remote.500"

    await net.close()
    await runner.cleanup()
