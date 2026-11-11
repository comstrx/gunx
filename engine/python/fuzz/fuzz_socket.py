from engine.error import Fault
from engine.socket import Frame
from hypothesis import HealthCheck, given, settings, strategies as st
from contextlib import suppress

EXAMPLES = 20000

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.binary(max_size=200))
def frames_never_crash ( raw: bytes ) -> None:

    with suppress(Fault): Frame.decode(raw, limit=100)

frames_never_crash()

print(f"fuzz socket  examples={EXAMPLES}  ok")
