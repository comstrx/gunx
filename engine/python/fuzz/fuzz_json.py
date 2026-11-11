from engine.error import Fault
from engine.json import json
from hypothesis import HealthCheck, given, settings, strategies as st
from contextlib import suppress

EXAMPLES = 4300

leaves = st.none() | st.booleans() | st.integers(min_value=-2**53, max_value=2**53) | st.text(max_size=40)
values = st.recursive(
    leaves | st.floats(allow_nan=False, allow_infinity=False),
    lambda inner: st.lists(inner, max_size=5) | st.dictionaries(st.text(max_size=10), inner, max_size=5),
    max_leaves=30,
)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(values)
def round_trips_every_value ( value: object ) -> None:

    assert json.decode(json.encode(value)) == value
    assert json.equal(value, json.plain(value))

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.binary(max_size=64))
def never_crashes_on_bytes ( data: bytes ) -> None:

    with suppress(Fault): json.decode(data)

    json.valid(data)

round_trips_every_value()
never_crashes_on_bytes()

print(f"fuzz json  examples={EXAMPLES * 2}  ok")
