from engine.error import Fault
from engine.stream import Range, stream
from collections.abc import AsyncIterator
import asyncio
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

@settings(max_examples=500, deadline=None, database=None)
@given(st.lists(st.binary(max_size=256), max_size=12), st.integers(-10, 64))
def chunks_preserve_bytes_or_refuse_invalid_size ( blocks: list[bytes], size: int ) -> None:

    async def source () -> AsyncIterator[bytes]:

        for block in blocks: yield block

    async def check () -> None:

        if size < 0:

            refused: Fault | None = None

            try: await anext(stream.chunks(source(), size))
            except Fault as fault: refused = fault

            assert refused is not None and refused.reason == "stream.chunk"

            return

        pieces = [piece async for piece in stream.chunks(source(), size)]

        assert b"".join(pieces) == b"".join(blocks)
        assert all(len(piece) == (size or stream.describe()["chunk"]) for piece in pieces[:-1])

    asyncio.run(check())

chunks_preserve_bytes_or_refuse_invalid_size()
