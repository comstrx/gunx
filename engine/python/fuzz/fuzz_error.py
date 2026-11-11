from engine.error import Bag, Code, Fault
from hypothesis import HealthCheck, given, settings, strategies as st
from contextlib import suppress

EXAMPLES = 3200
WIRE     = st.dictionaries(
    st.sampled_from(["code", "message", "reason", "errors", "retry_after", "status", "unknown", "extra"]),
    st.one_of(st.none(), st.text(max_size=20), st.integers(), st.floats(allow_nan=False), st.lists(st.text(max_size=5), max_size=3)),
    max_size=8,
)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(WIRE)
def a_foreign_payload_loads_as_a_fault ( payload: dict[str, object] ) -> None:

    with suppress(Fault): assert isinstance(Fault.load(payload), Fault)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(
    st.sampled_from(list(Code)), st.text(max_size=40), st.text(max_size=20),
    st.dictionaries(st.text(max_size=8), st.lists(st.text(max_size=8), max_size=3), max_size=4),
)
def a_fault_round_trips ( code: Code, message: str, reason: str, errors: dict[str, list[str]] ) -> None:

    made  = Fault(code, message or None, reason or None, errors or None)
    again = Fault.load(made.dump())

    assert (again.code, again.message, again.reason) == (made.code, made.message, made.reason)
    assert Code.of(int(code.status())) is not None
    assert made.client() != made.server() or not made.client()

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.integers(min_value=-10, max_value=1000), st.text(max_size=20), st.lists(st.tuples(st.text(max_size=6), st.text(max_size=6)), max_size=8))
def codes_and_bags_never_crash ( status: int, text: str, pairs: list[tuple[str, str]] ) -> None:

    assert isinstance(Code.of(status), Code)
    assert Code.parse(text, Code.INTERNAL) is not None

    bag = Bag()

    for field, message in pairs: bag.add(field, message)

    assert bag.count() == len(pairs)
    assert bag.has() == bool(pairs)

a_foreign_payload_loads_as_a_fault()
a_fault_round_trips()
codes_and_bags_never_crash()

print(f"fuzz error  examples={EXAMPLES * 3}  ok")
