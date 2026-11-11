from engine.error import Fault
from engine.parse import parse
from hypothesis import HealthCheck, given, settings, strategies as st
from contextlib import suppress

EXAMPLES = 10000

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.text(max_size=80))
def never_crashes_on_text ( text: str ) -> None:

    for reader in (parse.integer, parse.number, parse.boolean, parse.duration, parse.size, parse.semver):

        with suppress(Fault): reader(text)

    parse.query(text)
    parse.keys(text)
    parse.list(text)

    with suppress(Fault): parse.url(text)
    with suppress(Fault): parse.toml(text)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.integers(min_value=-10**12, max_value=10**12), st.floats(allow_nan=False, allow_infinity=False, width=32))
def numbers_round_trip ( whole: int, real: float ) -> None:

    assert parse.integer(str(whole)) == whole
    assert parse.number(repr(real)) == real

never_crashes_on_text()
numbers_round_trip()

print(f"fuzz parse  examples={EXAMPLES * 2}  ok")
