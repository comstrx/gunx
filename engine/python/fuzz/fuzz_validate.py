from engine.error import Fault
from engine.json import json
from engine.validate import Rules, Shape, rules, validator
from hypothesis import HealthCheck, given, settings, strategies as st
from contextlib import suppress
from collections import Counter
from typing import Any, ClassVar
from copy import deepcopy
import pytest

EXAMPLES = 8000
OBSERVED: Counter[str] = Counter()

class Person(Shape):

    name : str
    age  : int = 0

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.binary(max_size=64))
def shapes_never_crash ( data: bytes ) -> None:

    OBSERVED["shapes"] += 1
    interleaved = bytearray(len(data) * 2)

    interleaved[::2] = data

    for payload in (data, bytearray(data), memoryview(data), memoryview(interleaved)[::2]):

        with suppress(Fault): validator.shape(Person, payload)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.dictionaries(st.text(max_size=8), st.one_of(st.none(), st.text(max_size=20), st.integers(), st.booleans()), max_size=5))
def rules_never_crash ( payload: dict[str, object] ) -> None:

    OBSERVED["rules"] += 1

    with suppress(Fault): rules.check(payload, { "email": "required|email", "age": "integer|between:1,9", "x": "nullable|url" })

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.text(st.characters(exclude_categories=["Cs"]), max_size=128), st.integers(-(2 ** 63), 2 ** 63 - 1))
def buffers_preserve_values ( name: str, age: int ) -> None:

    OBSERVED["buffers"] += 1
    expected = Person(name=name, age=age)
    data = json.encode(expected.dump())
    interleaved = bytearray(len(data) * 2)

    interleaved[::2] = data

    for payload in (data, bytearray(data), memoryview(data), memoryview(interleaved)[::2]):

        assert validator.shape(Person, payload) == expected

ATOM = st.one_of(
    st.none(), st.booleans(), st.integers(-(10 ** 80), 10 ** 80),
    st.floats(allow_nan=True, allow_infinity=True), st.text(max_size=80),
)
TREE = st.recursive(ATOM, lambda leaf: st.one_of(
    st.lists(leaf, max_size=4), st.dictionaries(st.text(max_size=8), leaf, max_size=4),
), max_leaves=15)
RULE = st.sampled_from([
    "boolean", "accepted", "declined", "integer", "number", "numeric", "array", "list", "map",
    "min:1", "max:10", "size:2", "between:1,9", "digits:3", "digits_between:1,4", "min_digits:2",
    "max_digits:4", "decimal:0,4", "multiple_of:0.25", "distinct", "date", "email", "url", "timezone",
    "same:other", "different:other", "gt:other", "confirmed", "required_with:other", "exclude_if:other,yes",
    "required_if_accepted:other", "prohibited_if_accepted:other", "in_array:other", "regex:[a-z]+",
])

@settings(max_examples=4000, deadline=None, database=None)
@given(TREE, TREE, RULE)
def all_rules_return_only_values_or_faults ( value: Any, other: Any, rule: str ) -> None:

    OBSERVED["arbitrary_rules"] += 1
    payload = {"value": value, "other": other}

    with suppress(Fault): Rules().check(payload, {"value": rule, "other": "nullable"})

@settings(max_examples=2000, deadline=None, database=None)
@given(st.lists(st.lists(st.integers(), max_size=5), max_size=5))
def nested_paths_preserve_values_and_isolation ( groups: list[list[int]] ) -> None:

    OBSERVED["nested"] += 1
    payload = {"groups": [{"items": [{"id": value} for value in group]} for group in groups]}
    original = deepcopy(payload)
    plan = Rules().prepare({"groups.*.items.*.id": "required|integer"})
    result = plan.check(payload)

    assert result == payload

    result["groups"].append({"items": []})

    assert payload == original

@settings(max_examples=2000, deadline=None, database=None)
@given(st.text(min_size=1, max_size=30), st.text(min_size=1, max_size=30))
def confirmation_uses_the_named_sibling ( first: str, second: str ) -> None:

    OBSERVED["confirmation"] += 1
    payload = {"a": first, "a_confirmation": second, "b": second, "b_confirmation": first}
    spec = {"a": "required|confirmed", "b": "required|confirmed"}

    if first == second: assert Rules().check(payload, spec) == {"a": first, "b": second}
    else:

        with pytest.raises(Fault) as caught: Rules().check(payload, spec)

        assert caught.value.errors is not None and set(caught.value.errors) == {"a", "b"}

@settings(max_examples=2000, deadline=None, database=None)
@given(st.integers(-(10 ** 80), 10 ** 80), st.integers(-1, 1))
def exact_integer_bounds_are_not_rounded ( limit: int, offset: int ) -> None:

    OBSERVED["integer_bounds"] += 1
    payload = {"value": limit + offset}
    plan = Rules().prepare({"value": f"min:{limit}"})

    if offset >= 0: assert plan.check(payload) == payload
    else:

        try: plan.check(payload)
        except Fault: pass
        else: raise AssertionError("rounded integer comparison")

@settings(max_examples=2000, deadline=None, database=None)
@given(st.integers(-10000, 10000), st.text(max_size=20))
def prepared_and_dynamic_rules_agree ( value: int, text: str ) -> None:

    OBSERVED["prepared"] += 1
    book = Rules()
    spec = {"value": "integer", "text": "string"}
    payload = {"value": value, "text": text}

    assert book.prepare(spec).check(payload) == book.check(payload, spec)

@settings(max_examples=1500, deadline=None, database=None)
@given(st.lists(st.integers(), max_size=10))
def snapshots_do_not_change_after_registration ( values: list[int] ) -> None:

    OBSERVED["snapshots"] += 1
    book = Rules()
    book.register("custom", lambda _, __: None)
    plan = book.prepare({"value": "custom"})
    book.register("custom", lambda _, __: "refused")

    for value in values:

        assert plan.check({"value": value}) == {"value": value}

        try: book.check({"value": value}, {"value": "custom"})
        except Fault: pass
        else: raise AssertionError("stale cache after registration")

@settings(max_examples=1500, deadline=None, database=None)
@given(st.integers(), st.text(max_size=30))
def exclusion_precedes_child_validation ( private: int, name: str ) -> None:

    OBSERVED["exclusion"] += 1
    payload = {"user": {"name": name, "private": private}}
    spec = {"user.private.id": "required|integer", "user.private": "exclude", "user.name": "string"}

    assert Rules().check(payload, spec) == {"user": {"name": name}}

class Secret(Shape):

    hidden: ClassVar[tuple[str, ...]] = ("secret",)
    name: str
    secret: str

class Nested(Shape):

    values: list[Any]

@settings(max_examples=1500, deadline=None, database=None)
@given(st.text(max_size=80), st.text(max_size=80))
def nested_exports_never_include_hidden_fields ( name: str, secret: str ) -> None:

    OBSERVED["hidden"] += 1
    source = Nested(values=[Secret(name=name, secret=secret)])

    assert source.dump() == {"values": [{"name": name}]}
    assert source.values[0].secret == secret

@settings(max_examples=1500, deadline=None, database=None)
@given(st.integers(-(2 ** 63), 2 ** 63 - 1), st.text(st.characters(exclude_categories=["Cs"]), max_size=80))
def typed_copy_keeps_its_source ( age: int, name: str ) -> None:

    OBSERVED["copy"] += 1
    source = Person(name="original", age=1)
    made = source.copy(age=age, name=name)

    assert made.name == name and made.age == age
    assert source.name == "original" and source.age == 1

@settings(max_examples=2000, deadline=None, database=None)
@given(st.lists(st.dictionaries(st.sampled_from(["name", "age"]), st.integers() | st.text(max_size=20), max_size=2), max_size=8))
def diagnostics_agree_with_check ( rows: list[dict[str, Any]] ) -> None:

    OBSERVED["diagnostics"] = OBSERVED.get("diagnostics", 0) + 1
    plan = Rules().prepare({"items.*.name": "required|string", "items.*.age": "required|integer"})
    payload = {"items": rows}
    errors = plan.errors(payload)

    assert plan.valid(payload) == (not errors)

    caught: Fault | None = None
    result = None

    try: result = plan.check(payload)
    except Fault as error: caught = error

    if caught is not None: assert errors == caught.errors
    else: assert not errors and result == payload

@settings(max_examples=2000, deadline=None, database=None)
@given(st.dictionaries(st.sampled_from(["a", "b"]), st.integers() | st.none(), max_size=2))
def partial_keeps_required_for_present_values ( payload: dict[str, Any] ) -> None:

    OBSERVED["partial"] = OBSERVED.get("partial", 0) + 1
    full = Rules().prepare({"a": "required|integer", "b": "required|integer"})
    partial = full.partial()
    expected = {key: ["is required"] for key, value in payload.items() if value is None}

    assert partial.errors(payload) == expected
    assert full.valid(payload) == (set(payload) == {"a", "b"} and not expected)

@settings(max_examples=2000, deadline=None, database=None)
@given(st.lists(st.text(max_size=20), max_size=20), st.integers(-(2 ** 63), 2 ** 63 - 1))
def copy_isolates_unchanged_and_changed_lists ( tags: list[str], age: int ) -> None:

    OBSERVED["copy_lists"] = OBSERVED.get("copy_lists", 0) + 1

    class Values(Shape):

        tags: list[str]
        age: int

    source = Values(tags=tags, age=age)
    copied = source.copy(age=age)
    copied.tags.append("new")

    assert source.tags == tags and copied.tags == [*tags, "new"]
    changed = source.copy(tags=tags)
    changed.tags.clear()

    assert source.tags == tags

shapes_never_crash()
rules_never_crash()
buffers_preserve_values()
all_rules_return_only_values_or_faults()
nested_paths_preserve_values_and_isolation()
confirmation_uses_the_named_sibling()
exact_integer_bounds_are_not_rounded()
prepared_and_dynamic_rules_agree()
snapshots_do_not_change_after_registration()
exclusion_precedes_child_validation()
nested_exports_never_include_hidden_fields()
typed_copy_keeps_its_source()

diagnostics_agree_with_check()
partial_keeps_required_for_present_values()
copy_isolates_unchanged_and_changed_lists()

print(f"fuzz validate observed_examples={sum(OBSERVED.values())} properties={len(OBSERVED)} ok")
print(dict(OBSERVED))
