from engine.geo import Point, geo
from hypothesis import HealthCheck, given, settings, strategies as st

EXAMPLES = 20000

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.floats(min_value=-89.9, max_value=89.9), st.floats(min_value=-179.9, max_value=179.9))
def geohash_round_trips ( lat: float, lng: float ) -> None:

    point   = Point(lat, lng)
    decoded = geo.decode(geo.geohash(point, 9))

    assert geo.distance(point, decoded) < 10

geohash_round_trips()

print(f"fuzz geo  examples={EXAMPLES}  ok")
