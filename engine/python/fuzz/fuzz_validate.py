from engine.error import Fault
from engine.json import json
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

    interleaved = bytearray(len(data) * 2)

    interleaved[::2] = data

    for payload in (data, bytearray(data), memoryview(data), memoryview(interleaved)[::2]):

        with suppress(Fault): validator.shape(Person, payload)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.dictionaries(st.text(max_size=8), st.one_of(st.none(), st.text(max_size=20), st.integers(), st.booleans()), max_size=5))
def rules_never_crash ( payload: dict[str, object] ) -> None:

    with suppress(Fault): rules.check(payload, { "email": "required|email", "age": "integer|between:1,9", "x": "nullable|url" })

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.text(st.characters(exclude_categories=["Cs"]), max_size=128), st.integers(-(2 ** 63), 2 ** 63 - 1))
def buffers_preserve_values ( name: str, age: int ) -> None:

    expected = Person(name=name, age=age)
    data = json.encode(expected.dump())
    interleaved = bytearray(len(data) * 2)

    interleaved[::2] = data

    for payload in (data, bytearray(data), memoryview(data), memoryview(interleaved)[::2]):

        assert validator.shape(Person, payload) == expected

shapes_never_crash()
rules_never_crash()
buffers_preserve_values()

print(f"fuzz validate  examples={EXAMPLES * 3}  ok")
