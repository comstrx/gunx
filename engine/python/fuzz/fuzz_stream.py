from engine.error import Fault
from engine.stream import Range
from hypothesis import HealthCheck, given, settings, strategies as st
from contextlib import suppress

EXAMPLES = 9000

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.text(max_size=40), st.integers(min_value=0, max_value=10_000_000))
def every_header_is_parsed_or_refused_with_416 ( header: str, size: int ) -> None:

    refused: Fault | None = None

    try: found = Range.parse(header, size)
    except Fault as fault:

        refused = fault
        found   = None

    if refused is not None:

        assert refused.status == 416
        assert refused.headers == { "Content-Range": f"bytes */{size}" }

        return

    if found is None: return

    assert 0 <= found.start <= found.end < size
    assert found.length() == found.end - found.start + 1

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.integers(min_value=0, max_value=1_000_000), st.integers(min_value=0, max_value=1_000_000), st.integers(min_value=1, max_value=1_000_000))
def well_formed_ranges_stay_inside_the_body ( first: int, last: int, size: int ) -> None:

    with suppress(Fault):

        found = Range.parse(f"bytes={first}-{last}", size)

        assert found is not None
        assert found.start == first
        assert found.end == min(last, size - 1)
        assert found.end >= found.start

every_header_is_parsed_or_refused_with_416()
well_formed_ranges_stay_inside_the_body()

print(f"fuzz stream  examples={EXAMPLES * 2}  ok")
