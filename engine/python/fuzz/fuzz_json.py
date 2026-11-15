from collections.abc import AsyncIterator
import asyncio
from engine.error import Fault
from engine.json import json
from hypothesis import given, settings, strategies as st
from contextlib import suppress
from typing import Any
from copy import deepcopy
from types import MappingProxyType

EXAMPLES = 4300

leaves = st.none() | st.booleans() | st.integers(min_value=-2**53, max_value=2**53) | st.text(max_size=40)
values = st.recursive(
    leaves | st.floats(allow_nan=False, allow_infinity=False),
    lambda inner: st.lists(inner, max_size=5) | st.dictionaries(st.text(max_size=10), inner, max_size=5),
    max_leaves=30,
)

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(values)
def round_trips_every_value ( value: object ) -> None:

    assert json.decode(json.encode(value)) == value
    assert json.equal(value, json.plain(value))

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.binary(max_size=64))
def never_crashes_on_bytes ( data: bytes ) -> None:

    with suppress(Fault): json.decode(data)

    json.valid(data)


@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.dictionaries(st.text(alphabet="abc", min_size=1, max_size=5), values, max_size=8), st.lists(st.sampled_from(["a", "b", "c", "a.0", "", "missing"]), max_size=8))
def omit_matches_sequential_forget ( value: dict[str, Any], paths: list[str] ) -> None:

    original = deepcopy(value)
    expected = dict(value)

    for path in paths: expected = json.forget(expected, path)

    assert json.omit(value, *paths) == expected and value == original




@settings(max_examples=200, deadline=None, database=None)
@given(st.lists(values, max_size=12))
def streaming_matches_materialized_encoding ( rows: list[Any] ) -> None:

    async def source () -> AsyncIterator[object]:

        for row in rows: yield row

    async def check () -> None:

        encoded = b"".join([piece async for piece in json.encode_stream(source())])

        assert encoded == json.encode(rows)

    asyncio.run(check())


@settings(max_examples=1000, deadline=None, database=None)
@given(values)
def pruning_is_idempotent_and_does_not_mutate_input ( value: Any ) -> None:

    original = deepcopy(value)
    pruned = json.prune(value)

    assert json.prune(pruned) == pruned and value == original


@settings(max_examples=4300, deadline=None, database=None)
@given(values, values)
def diff_patch_round_trips_independent_json_trees ( left: Any, right: Any ) -> None:

    original_left = deepcopy(left)
    original_right = deepcopy(right)
    result = json.patch(left, json.diff(left, right))

    assert json.equal(result, right)
    assert json.equal(left, original_left) and json.equal(right, original_right)


@settings(max_examples=2000, deadline=None, database=None)
@given(st.dictionaries(st.text(alphabet="abc", min_size=1, max_size=4), st.lists(st.integers(), max_size=8), max_size=15))
def pick_detaches_every_selected_value ( value: dict[str, list[int]] ) -> None:

    original = deepcopy(value)
    result = json.pick(value, *value)
    assert result == original

    for item in result.values(): item.append(9)

    assert value == original


@settings(max_examples=2000, deadline=None, database=None)
@given(st.lists(values, min_size=1, max_size=10), st.integers(min_value=0, max_value=9))
def move_and_copy_follow_sequential_array_positions ( value: list[Any], offset: int ) -> None:

    source = offset % len(value)
    expected = deepcopy(value)
    moved = expected.pop(source)
    expected.append(moved)
    result = json.patch(value, [{ "op": "move", "from": f"/{source}", "path": "/-" }])

    assert json.equal(result, expected)
    copied = json.patch(value, [{ "op": "copy", "from": f"/{source}", "path": "/0" }])
    assert json.equal(copied, [value[source], *value])


@settings(max_examples=2000, deadline=None, database=None)
@given(values, values)
def malformed_patch_never_leaks_runtime_errors ( value: Any, ops: Any ) -> None:

    original = deepcopy(value)

    with suppress(Fault): json.patch(value, ops)

    assert json.equal(value, original)



def read_only ( value: Any ) -> Any:

    if isinstance(value, dict): return MappingProxyType({ key: read_only(item) for key, item in value.items() })
    if isinstance(value, list): return [read_only(item) for item in value]

    return value


@settings(max_examples=2000, deadline=None, database=None)
@given(values)
def read_only_trees_encode_without_losing_values ( value: Any ) -> None:

    held = read_only(value)

    assert json.encode(held, stable=True) == json.encode(value, stable=True)
    assert json.decode(json.encode(held)) == value



@settings(max_examples=1000, deadline=None, database=None)
@given(st.lists(values, max_size=15))
def line_stream_round_trips_without_changing_rows ( rows: list[Any] ) -> None:

    original = deepcopy(rows)
    encoded = json.lines(iter(rows))

    assert json.unlines(encoded) == original == rows
    assert encoded.count(b"\n") == len(rows)
    assert not encoded or encoded.endswith(b"\n")

line_stream_round_trips_without_changing_rows()

round_trips_every_value()
never_crashes_on_bytes()
omit_matches_sequential_forget()
streaming_matches_materialized_encoding()
pruning_is_idempotent_and_does_not_mutate_input()
diff_patch_round_trips_independent_json_trees()
pick_detaches_every_selected_value()
move_and_copy_follow_sequential_array_positions()
malformed_patch_never_leaks_runtime_errors()

read_only_trees_encode_without_losing_values()


@settings(max_examples=1500, deadline=None, database=None)
@given(st.dictionaries(st.text(alphabet="abcdef", min_size=1, max_size=5), st.integers(), max_size=20))
def batch_updates_preserve_source_and_values ( fields: dict[str, int] ) -> None:

    source = {"original": {"a": 1}}
    result = json.edit(source, fields)
    assert source == {"original": {"a": 1}}
    assert all(result[key] == value for key, value in fields.items())

batch_updates_preserve_source_and_values()

@settings(max_examples=1000, deadline=None, database=None)
@given(st.dictionaries(st.text(alphabet="abcdef", min_size=1, max_size=8), st.integers(), max_size=30))
def one_pass_walk_matches_independent_key_value_transform ( fields: dict[str, int] ) -> None:

    original = dict(fields)
    made = json.walk({"values": fields}, lambda value: value + 1, keys=str.upper)
    assert made == {"VALUES": {key.upper(): value + 1 for key, value in original.items()}}
    assert fields == original

one_pass_walk_matches_independent_key_value_transform()

print("fuzz json  properties=13  ok")

COPY_OBSERVED = [0]

@settings(max_examples=3000, deadline=None, database=None)
@given(values)
def copies_match_the_standard_reference ( value: Any ) -> None:

    COPY_OBSERVED[0] += 1

    assert json.copy(value) == deepcopy(value)

@settings(max_examples=2000, deadline=None, database=None)
@given(st.lists(leaves, max_size=30))
def copies_keep_cycles_and_shared_references ( items: list[Any] ) -> None:

    COPY_OBSERVED[0] += 1
    source = {"a": items, "b": items}
    items.append(source)
    copied = json.copy(source)

    assert copied is not source and copied["a"] is copied["b"]
    assert copied["a"] is not items and copied["a"][-1] is copied
    copied["a"].append("new")

    assert items[-1] is source

copies_match_the_standard_reference()
copies_keep_cycles_and_shared_references()
print(f"fuzz json copy observed_examples={COPY_OBSERVED[0]} properties=2 ok")
