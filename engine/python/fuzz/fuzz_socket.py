from engine.error import Code, Fault
from engine.socket import Frame
from hypothesis import HealthCheck, given, settings, strategies as st
from contextlib import suppress

EXAMPLES = 20000

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.binary(max_size=200))
def frames_never_crash ( raw: bytes ) -> None:

    with suppress(Fault): Frame.decode(raw, limit=100)


@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.text(max_size=200), st.integers(min_value=0, max_value=100))
def text_frames_respect_byte_limit ( raw: str, limit: int ) -> None:

    try: frame = Frame.decode(raw, limit)
    except Fault as fault:

        code = fault.code

    else:

        assert len(raw.encode()) <= limit and isinstance(frame, Frame)

        return

    assert code in (Code.TOO_LARGE, Code.BAD_REQUEST, Code.VALIDATION)

frames_never_crash()
text_frames_respect_byte_limit()

print(f"fuzz socket  examples={EXAMPLES * 2}  ok")
