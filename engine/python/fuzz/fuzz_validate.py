from engine.error import Fault
from engine.validate import Shape, rules, validator
from hypothesis import HealthCheck, given, settings, strategies as st
from contextlib import suppress

EXAMPLES = 8000

class Person(Shape):

    name : str
    age  : int = 0

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.binary(max_size=64))
def shapes_never_crash ( data: bytes ) -> None:

    with suppress(Fault): validator.shape(Person, data)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.dictionaries(st.text(max_size=8), st.one_of(st.none(), st.text(max_size=20), st.integers(), st.booleans()), max_size=5))
def rules_never_crash ( payload: dict[str, object] ) -> None:

    with suppress(Fault): rules.check(payload, { "email": "required|email", "age": "integer|between:1,9", "x": "nullable|url" })

shapes_never_crash()
rules_never_crash()

print(f"fuzz validate  examples={EXAMPLES * 2}  ok")
