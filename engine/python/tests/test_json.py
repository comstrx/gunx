from collections.abc import AsyncIterator, Iterator, Mapping
from engine.error import Code, Fault
from engine.json import Json, json
from collections import UserDict
from types import MappingProxyType
from engine.string import string
from typing import Any, override
import asyncio, gc, weakref, pytest

class Point:

    def __init__ ( self, x: int, y: int = 0 ) -> None:

        self.x, self.y = x, y

    def dump ( self ) -> dict[str, int]:

        return { "x": self.x, "y": self.y }

def test_encodes_and_decodes_values_fast () -> None:

    assert json.encode({ "b": 1, "a": [1, 2.5, None, True] }, stable=True) == b'{"a":[1,2.5,null,true],"b":1}'
    assert json.decode(b'{"a": 1}') == { "a": 1 }
    assert json.loads('[1, "x"]') == [1, "x"]
    assert json.dumps({ "k": "v" }) == '{"k":"v"}'
    assert json.pretty({ "b": 1, "a": 2 }) == '{\n  "a": 2,\n  "b": 1\n}'
    assert json.equal({ "a": 1, "b": 2 }, { "b": 2, "a": 1 }) and not json.equal([1], [2])
    assert json.size({ "a": 1 }) == 7 and json.valid("{}") and not json.valid("{")
    assert json.plain(Point(x=1)) == { "x": 1, "y": 0 }
    assert json.encode({ 1: {"b", "a"} }) == b'{"1":["a","b"]}'
    assert json.encode({ "raw": b"bytes" }) == b'{"raw":"bytes"}'

def test_refuses_malformed_and_wrong_shapes () -> None:

    with pytest.raises(Fault) as bad: json.decode(b"{")

    assert bad.value.code is Code.BAD_REQUEST and bad.value.reason == "json.decode"

    with pytest.raises(Fault) as unencodable: json.encode(object())

    assert unencodable.value.reason == "json.encode"


def test_custom_fallback_and_dump_protocol () -> None:

    class Money:

        def dump ( self ) -> dict[str, int]: return { "minor": 5 }

    class Odd: ...

    codec = Json()
    codec.use(lambda value: "odd" if isinstance(value, Odd) else None)

    assert codec.encode([Money(), Odd()]) == b'[{"minor":5},"odd"]'
    assert Point(x=3).dump() == { "x": 3, "y": 0 }

    with pytest.raises(Fault): json.encode(object())

def test_walks_nested_values () -> None:

    data: dict[str, Any] = { "a": { "b": [10, { "c": 1 }] }, "e": "", "f": None, "g": [] }

    assert json.get(data, "a.b.1.c") == 1 and json.get(data, "a.b.9", "d") == "d" and json.get(data, "") == data
    assert json.merge({ "a": { "x": 1 }, "k": 1 }, { "a": { "y": 2 }, "k": 2 }) == { "a": { "x": 1, "y": 2 }, "k": 2 }
    assert json.flatten({ "a": { "b": { "c": 1 } }, "d": 2 }) == { "a.b.c": 1, "d": 2 }
    assert json.prune(data) == { "a": { "b": [10, { "c": 1 }] } }
    assert json.prune([0, False, None, ""]) == [0, False]

def test_puts_picks_and_patches () -> None:

    data: dict[str, Any] = { "a": { "b": [10, { "c": 1 }], "d": None }, "e": 2 }

    assert json.has(data, "a.d") and not json.has(data, "a.z") and json.has(data, "a.b.1.c") and not json.has(data, "a.b.5")
    assert json.put(data, "a.x.y", 5)["a"]["x"] == { "y": 5 } and json.put(data, "a.b.0", 11)["a"]["b"][0] == 11 and json.put(data, "", 1) == 1
    assert data["a"]["b"][0] == 10 and json.put(data, "e.f", 1) == { **data, "e": { "f": 1 } } and json.put([1, 2], "1", 3) == [1, 3]
    assert json.forget(data, "a.b.1")["a"]["b"] == [10] and json.forget(data, "e") == { "a": data["a"] } and json.forget(data, "zz") == data
    assert json.pick(data, "a.d", "e", "nope") == { "a": { "d": None }, "e": 2 } and json.omit(data, "a.b", "e") == { "a": { "d": None } }
    assert json.unflatten({ "a.b.c": 1, "a.d": 2, "e": 3 }) == { "a": { "b": { "c": 1 }, "d": 2 }, "e": 3 } and json.unflatten(json.flatten(data)) == data
    assert json.paths(data) == ["a.b", "a.d", "e"]
    assert json.rename({ "firstName": [{ "lastName": 1 }] }, string.snake) == { "first_name": [{ "last_name": 1 }] }
    assert json.rename({ "firstName": { "lastName": 1 } }, string.snake, deep=False) == { "first_name": { "lastName": 1 } }
    assert json.walk({ "a": [1, { "b": 2 }] }, lambda v: v * 10) == { "a": [10, { "b": 20 }] }
    assert [json.kind(v) for v in (None, True, 1, 1.5, "s", {}, [], object())] == ["null", "boolean", "number", "number", "string", "object", "array", "object"]

    before: dict[str, Any] = { "a": 1, "b": { "c": [1, 2, 3] }, "d": "x", "k/ey": 1 }
    after: dict[str, Any] = { "a": 1, "b": { "c": [1, 9] }, "e": True, "k/ey": 2 }
    ops    = json.diff(before, after)

    assert ops == [
        { "op": "replace", "path": "/b/c/1", "value": 9 }, { "op": "remove", "path": "/b/c/2" }, { "op": "remove", "path": "/d" },
        { "op": "replace", "path": "/k~1ey", "value": 2 }, { "op": "add", "path": "/e", "value": True },
    ]
    assert json.patch(before, ops) == after and before["b"]["c"] == [1, 2, 3] and json.diff(after, after) == []
    assert json.diff([1], [1, 2]) == [{ "op": "add", "path": "/-", "value": 2 }] and json.patch([1], json.diff([1], [1, 2])) == [1, 2]
    assert json.diff(1, "1") == [{ "op": "replace", "path": "", "value": "1" }] and json.patch(1, json.diff(1, "1")) == "1"
    assert json.patch({ "a": [1] }, [{ "op": "add", "path": "/a/0", "value": 0 }]) == { "a": [0, 1] }

def test_lines_canonical_and_embed () -> None:

    assert json.lines([{ "a": 1 }, [2]]) == b'{"a":1}\n[2]\n' and json.unlines(b'{"a":1}\n\n[2]\n') == [{ "a": 1 }, [2]]
    assert json.unlines('{"x":"y"}') == [{ "x": "y" }] and json.canonical({ "b": 1, "a": 2 }) == b'{"a":2,"b":1}'
    assert json.embed({ "s": "</script><b>&" }) == '{"s":"\\u003c/script\\u003e\\u003cb\\u003e\\u0026"}'
    assert json.embed("\u2028") == '"\\u2028"'

def test_the_laravel_lap_of_json_verbs () -> None:

    data = { "a": { "b": 1 }, "tags": ["x"] }

    assert json.add(data, "a.b", 9)["a"]["b"] == 1 and json.add(data, "a.c", 9)["a"]["c"] == 9 and data["a"] == { "b": 1 }
    assert json.has_any(data, "nope", "a.b") and not json.has_any(data, "nope") and json.has_all(data, "a", "tags") and not json.has_all(data, "a", "zz")
    assert not json.has_all(data)
    assert json.prefix({ "a": 1 }, "x.") == { "x.a": 1 } and json.flip({ "a": 1, "b": 2 }) == { 1: "a", 2: "b" }
    assert json.pull(data, "a.b") == (1, { "a": {}, "tags": ["x"] }) and json.pull(data, "zz", 5)[0] == 5
    assert json.push(data, "tags", "y")["tags"] == ["x", "y"] and json.push(data, "new", 1)["new"] == [1] and json.push(data, "a.b", 2)["a"]["b"] == [1, 2]

def test_laravel_arr_path_examples_behave_the_same () -> None:

    assert json.add({ "name": "Desk" }, "price", 100) == { "name": "Desk", "price": 100 }
    assert json.add({ "name": "Desk", "price": 100 }, "price", 200) == { "name": "Desk", "price": 100 }
    assert json.flatten({ "products": { "desk": { "price": 100 } } }) == { "products.desk.price": 100 }
    assert json.get({ "products": { "desk": { "price": 100 } } }, "products.desk.price") == 100
    assert json.has({ "product": { "name": "Desk", "price": 100 } }, "product.name") and not json.has({ "product": {} }, "product.discount")
    assert json.pull({ "name": "Desk", "price": 100 }, "name") == ("Desk", { "price": 100 })
    assert json.put({ "products": { "desk": { "price": 100 } } }, "products.desk.price", 200) == { "products": { "desk": { "price": 200 } } }
    assert json.unflatten({ "user.name": "Kevin Malone", "user.occupation": "Accountant" }) == {
        "user": { "name": "Kevin Malone", "occupation": "Accountant" },
    }

def test_omit_preserves_nested_copy_and_sequential_list_paths () -> None:

    source: dict[str, Any] = { "items": [{ "name": "first", "secret": [1] }, { "name": "second", "secret": [2] }], "keep": { "values": [3] } }
    result = json.omit(source, "items.0", "items.0.secret")

    assert result == { "items": [{ "name": "second" }], "keep": { "values": [3] } }

    result["keep"]["values"].append(4)

    assert source["keep"]["values"] == [3] and len(source["items"]) == 2
    assert json.omit(source, "missing", "") == source
    assert json.omit({ "a": { "b": 1, "c": 2 } }, "a/b", separator="/") == { "a": { "c": 2 } }

def test_root_replacement_does_not_copy_discarded_data () -> None:

    class Uncopyable:

        def __deepcopy__ ( self, memo: dict[int, Any] ) -> Any:

            raise AssertionError("discarded root must not be copied")

    replacement = { "value": [1] }

    assert json.put(Uncopyable(), "", replacement) is replacement


async def test_encode_stream_closes_on_early_stop () -> None:

    closed: list[bool] = []

    async def source () -> AsyncIterator[object]:

        try:

            yield { "name": "لغة" }
            raise AssertionError("read ahead")

        finally: closed.append(True)

    stream = json.encode_stream(source())

    assert await anext(stream) == b"["
    assert json.decode(await anext(stream)) == { "name": "لغة" }

    await stream.aclose()

    assert closed == [True]

def test_prune_preserves_false_zero_order_and_source () -> None:

    value = { "empty": { "value": None }, "false": False, "zero": 0, "list": [None, { "keep": 2, "omit": "" }] }
    expected = { "false": False, "zero": 0, "list": [{ "keep": 2 }] }
    result = json.prune(value)

    assert result == expected and list(result) == ["false", "zero", "list"]
    assert value["empty"] == { "value": None }
    assert json.prune(result) == result
    assert json.prune({ "false": False, "zero": 0 }, empty=(False,)) == { "zero": 0 }

def test_patch_root_and_empty_member_are_distinct () -> None:

    before = { "": 1, "keep": 2 }
    after = { "": 9, "keep": 2 }

    assert json.patch(before, json.diff(before, after)) == after
    assert json.diff(1, 2) == [{ "op": "replace", "path": "", "value": 2 }]


@pytest.mark.parametrize("op", [
    { "op": "unknown", "path": "/a", "value": 9 },
    { "op": "test", "path": "/a", "value": 9 },
    { "op": "replace", "path": "/missing", "value": 9 },
    { "op": "remove", "path": "/missing" },
    { "op": "add", "path": "a", "value": 9 },
])
def test_patch_refuses_invalid_operations ( op: dict[str, Any] ) -> None:

    with pytest.raises(Fault): json.patch({ "a": 1 }, [op])


def test_pick_owns_each_selected_branch () -> None:

    source = { "a": { "values": [1] }, "b": { "values": [2] } }
    selected = json.pick(source, "a", "b")

    selected["a"]["values"].append(3)
    selected["b"]["values"].append(4)

    assert source == { "a": { "values": [1] }, "b": { "values": [2] } }


@pytest.mark.parametrize("path", ["²", "\u0661", "-1", "1" * 5000])
def test_invalid_list_paths_do_not_leak_conversion_errors ( path: str ) -> None:

    assert json.get([1], path, "missing") == "missing"
    assert json.put([1], path, 9) == [1]
    assert json.forget([1], path) == [1]

@pytest.mark.parametrize("operation", [
    { "op": "replace", "path": "/-1", "value": 4 },
    { "op": "add", "path": "/9", "value": 4 },
    { "op": "remove", "path": "/-" },
    { "op": "replace", "path": "/01", "value": 4 },
    { "op": "replace", "path": "/\\u0661", "value": 4 },
    { "op": "replace", "path": "/" + "1" * 5000, "value": 4 },
    { "op": "replace", "path": None, "value": 4 },
    { "op": "add", "path": "", },
    { "op": "copy", "path": "/0" },
    { "op": [], "path": "/0" },
])
def test_patch_rejects_bad_indices_and_shapes ( operation: dict[str, Any] ) -> None:

    with pytest.raises(Fault) as caught: json.patch([1, 2], [operation])

    assert caught.value.code is Code.BAD_REQUEST and caught.value.reason == "json.patch"


def test_patch_six_operations_and_source_ownership () -> None:

    before = { "items": [{ "n": [1] }, { "n": [2] }], "keep": True }
    extra = { "n": [3] }
    ops: list[dict[str, Any]] = [
        { "op": "test", "path": "/items/0/n/0", "value": 1.0 },
        { "op": "copy", "from": "/items/0", "path": "/clone" },
        { "op": "move", "from": "/items/0", "path": "/items/1" },
        { "op": "replace", "path": "/keep", "value": False },
        { "op": "add", "path": "/items/-", "value": extra },
        { "op": "remove", "path": "/items/0" },
    ]
    patched = json.patch(before, ops)

    assert patched == { "items": [{ "n": [1] }, { "n": [3] }], "keep": False, "clone": { "n": [1] } }

    patched["clone"]["n"].append(4)
    patched["items"][1]["n"].append(5)

    assert before == { "items": [{ "n": [1] }, { "n": [2] }], "keep": True }
    assert patched["items"][0]["n"] == [1] and extra == { "n": [3] }


def test_patch_failure_is_atomic_for_input_and_ops () -> None:

    source = { "items": [1] }
    incoming = { "values": [2] }
    ops: list[dict[str, Any]] = [
        { "op": "add", "path": "/incoming", "value": incoming },
        { "op": "add", "path": "/incoming/values/-", "value": 3 },
        { "op": "test", "path": "/items/0", "value": 9 },
    ]

    with pytest.raises(Fault) as caught: json.patch(source, ops)

    assert caught.value.reason == "json.test"
    assert source == { "items": [1] } and incoming == { "values": [2] }


@pytest.mark.parametrize(("left", "right"), [(True, 1), (False, 0), ([True], [1]), ({ "x": False }, { "x": 0 })])
def test_patch_test_distinguishes_booleans_and_numbers ( left: Any, right: Any ) -> None:

    with pytest.raises(Fault) as caught: json.patch(left, [{ "op": "test", "path": "", "value": right }])

    assert caught.value.code is Code.CONFLICT


def test_patch_pointer_escapes_and_root_operations () -> None:

    source = { "": { "~1": { "/": 1 } } }
    assert json.patch(source, [{ "op": "replace", "path": "//~01/~1", "value": 2 }]) == { "": { "~1": { "/": 2 } } }
    assert json.patch(source, [{ "op": "add", "path": "", "value": [1] }]) == [1]
    assert json.patch(source, [{ "op": "remove", "path": "" }]) is None
    assert json.patch(source, [{ "op": "move", "from": "", "path": "" }]) == source
    assert json.patch(source, [{ "op": "copy", "from": "", "path": "/copy" }]) == { **source, "copy": source }
    assert json.patch({ "x": 1 }, [{ "op": "move", "from": "/x", "path": "" }]) == 1


@pytest.mark.parametrize("op", [
    { "op": "move", "from": "/a", "path": "/a/b" },
    { "op": "move", "from": "", "path": "/a" },
    { "op": "copy", "from": "/missing", "path": "/a" },
    { "op": "add", "path": "/a~2", "value": 1 },
    { "op": "add", "path": "/a~", "value": 1 },
    { "op": "replace", "path": "/a/b/c", "value": 1 },
])
def test_patch_rejects_invalid_traversals ( op: dict[str, Any] ) -> None:

    with pytest.raises(Fault): json.patch({ "a": { "b": 1 } }, [op])


def test_pick_overlapping_paths_and_put_inputs_are_detached () -> None:

    source: dict[str, Any] = { "a": { "b": [1], "c": [2] }, "other": 3 }

    for paths in (("a", "a.b"), ("a.b", "a"), ("", "a.b")):

        picked = json.pick(source, *paths)
        picked["a"]["b"].append(9)

        assert source["a"]["b"] == [1]

    incoming = { "v": [3] }
    changed = json.put(source, "new", incoming)
    changed["new"]["v"].append(4)

    assert incoming == { "v": [3] }


def test_json_fallback_reset_and_invalid_utf8 () -> None:

    codec = Json()
    codec.use(lambda _: "handled")
    assert codec.encode(object()) == b'"handled"'
    codec.use(None)

    with pytest.raises(Fault): codec.encode(object())
    with pytest.raises(Fault): codec.encode(bytes([255]))

    assert codec.encode("لغة".encode()) == '"لغة"'.encode()


async def test_stream_failure_closes_source_without_read_ahead () -> None:

    closed = []

    async def source () -> AsyncIterator[object]:

        try:

            yield 1
            yield object()
            raise AssertionError("source read after encoding failure")

        finally: closed.append(True)

    stream = json.encode_stream(source())

    assert await anext(stream) == b"[" and await anext(stream) == b"1"

    with pytest.raises(Fault): await anext(stream)

    assert closed == [True]


async def test_stream_cancellation_closes_source () -> None:

    started = asyncio.Event()
    closed = []

    async def source () -> AsyncIterator[object]:

        try:

            started.set()
            await asyncio.Event().wait()
            yield 1

        finally: closed.append(True)

    stream = json.encode_stream(source())
    assert await anext(stream) == b"["
    task = asyncio.create_task(anext(stream))
    await started.wait()
    task.cancel()

    with pytest.raises(asyncio.CancelledError): await task

    assert closed == [True]


def test_path_separators_and_empty_keys () -> None:

    data = { "a": { "b": [3] }, "": 4 }

    assert json.get(data, "a/b/0", separator="/") == 3
    assert json.pick(data, "a/b", separator="/") == { "a": { "b": [3] } }

    with pytest.raises(Fault): json.get(data, "a", separator="")

def test_omit_without_paths_detaches_nested_values () -> None:

    source = { "items": [1] }
    result = json.omit(source)
    result["items"].append(2)

    assert source == { "items": [1] }


@pytest.mark.parametrize("ops", [None, {}, "", b"", False, 0], ids=["null", "object", "text", "bytes", "boolean", "number"])
def test_patch_requires_an_operation_sequence ( ops: Any ) -> None:

    with pytest.raises(Fault): json.patch({}, ops)


def test_removed_root_is_absent_until_added_again () -> None:

    removed = [{ "op": "remove", "path": "" }]

    for operation in (
        { "op": "remove", "path": "" },
        { "op": "replace", "path": "", "value": 1 },
        { "op": "test", "path": "", "value": None },
    ):

        with pytest.raises(Fault): json.patch(None, [*removed, operation])

    assert json.patch({}, [*removed, { "op": "add", "path": "", "value": [1] }]) == [1]


def test_flatten_preserves_empty_key_hierarchy () -> None:

    value = { "": { "b": 1, "": { "c": 2 } }, "a": 3 }
    flat = json.flatten(value)

    assert flat == { ".b": 1, "..c": 2, "a": 3 }
    assert json.unflatten(flat) == value


def test_deep_patch_and_diff_fail_with_engine_fault () -> None:

    left: Any = 0
    right: Any = 1

    for _ in range(1500):

        left = [left]
        right = [right]

    with pytest.raises(Fault) as diff_error: json.diff(left, right)
    with pytest.raises(Fault) as patch_error: json.patch(left, [])

    assert diff_error.value.reason == "json.depth" and patch_error.value.reason == "json.patch"

@pytest.mark.parametrize("wrap", [MappingProxyType, UserDict])
def test_json_encodes_read_only_and_general_mappings ( wrap: Any ) -> None:

    source = wrap({ "actor": wrap({ "id": "a1" }), "items": [wrap({ "value": 1 })] })

    assert json.decode(json.encode(source)) == { "actor": { "id": "a1" }, "items": [{ "value": 1 }] }
    assert json.plain(source) == { "actor": { "id": "a1" }, "items": [{ "value": 1 }] }

def test_json_dump_protocol_is_read_once_before_mapping_fallback () -> None:

    class Record(UserDict[str, Any]):

        reads = 0

        @property
        def dump ( self ) -> Any:

            self.reads += 1

            return lambda: { "safe": True }

    record = Record({ "private": "hidden" })

    assert json.encode(record) == b'{"safe":true}' and record.reads == 1

def test_read_only_mapping_without_a_copy_method_still_encodes () -> None:

    class Readable(Mapping[str, int]):

        @override
        def __getitem__ ( self, key: str ) -> int:

            if key != "value": raise KeyError(key)

            return 7

        @override
        def __iter__ ( self ) -> Iterator[str]:

            return iter(("value",))

        @override
        def __len__ ( self ) -> int:

            return 1

    assert json.encode(MappingProxyType(Readable())) == b'{"value":7}'

def test_lines_consume_once_preserve_unicode_and_propagate_failure () -> None:

    seen: list[int] = []

    def rows () -> Iterator[object]:

        for index in range(3):

            seen.append(index)

            yield { "index": index, "text": "س\\nطر" }

    encoded = json.lines(rows())

    assert seen == [0, 1, 2]
    assert encoded == b"".join(json.encode({ "index": index, "text": "س\\nطر" }) + b"\n" for index in seen)
    assert json.unlines(encoded) == [{ "index": index, "text": "س\\nطر" } for index in seen]
    assert json.lines(iter(())) == b""

    def broken () -> Iterator[object]:

        yield 1
        raise LookupError("source failed")

    with pytest.raises(LookupError, match="source failed"): json.lines(broken())


def test_batch_edit_copies_once_and_isolates_every_inserted_value () -> None:

    original = {"a": {"x": 1}, "drop": 9}
    item = {"items": [1]}
    made = json.edit(original, {"a.x": 2, "b": item}, remove=["drop"])
    assert made == {"a": {"x": 2}, "b": {"items": [1]}}
    made["b"]["items"].append(2)
    assert item == {"items": [1]} and original == {"a": {"x": 1}, "drop": 9}

def test_optional_numpy_serialization_preserves_supported_native_values () -> None:

    np = pytest.importorskip("numpy")
    rows = np.arange(12, dtype=np.int64).reshape(3, 4)
    assert json.decode(json.encode(rows)) == rows.tolist()
    assert json.decode(json.encode(np.int64(2**62))) == 2**62
    assert json.decode(json.encode(np.array([True, False], dtype=np.bool_))) == [True, False]
    assert json.decode(json.encode(np.array([1.5, float("nan")], dtype=np.float64))) == [1.5, None]
    with pytest.raises(Fault): json.encode(rows[:, ::2])
    with pytest.raises(Fault): json.encode(np.array([1, 2], dtype=np.dtype("i8").newbyteorder("S")))

def test_walk_combines_key_and_value_changes_and_preserves_tuples () -> None:

    value = {"first": ({"value": 1},), "last": [2]}
    made = json.walk(value, lambda item: item + 1, keys=str.upper)
    assert made == {"FIRST": ({"VALUE": 2},), "LAST": [3]}
    assert value == {"first": ({"value": 1},), "last": [2]}
    assert json.rename(value, str.upper, deep=False) == {"FIRST": value["first"], "LAST": value["last"]}
    assert json.rename(value["last"], str.upper, deep=False) is value["last"]

def test_walk_refuses_cycles_collisions_and_excess_work () -> None:

    cycle: list[Any] = []
    cycle.append(cycle)
    with pytest.raises(Fault) as caught: json.walk(cycle, str)
    assert caught.value.reason == "json.cycle"
    with pytest.raises(Fault): json.walk({"a": 1, "A": 2}, str, keys=str.upper)
    deep: Any = 0
    for _ in range(130): deep = [deep]
    with pytest.raises(Fault) as caught: json.walk(deep, str)
    assert caught.value.code is Code.TOO_LARGE
    shared = [1]
    assert json.walk([shared, shared], lambda value: value + 1) == [[2], [2]]

def test_walk_callback_failures_do_not_modify_input () -> None:

    value = {"a": 1, "b": 2}
    def fail ( item: Any ) -> Any:

        if item == 2: raise ValueError("stop")
        return item + 1

    with pytest.raises(ValueError, match="stop"): json.walk(value, fail)
    assert value == {"a": 1, "b": 2}

def test_walk_releases_callback_without_waiting_for_cyclic_collection () -> None:

    def change ( value: Any ) -> Any:

        return value

    held = weakref.ref(change)
    enabled = gc.isenabled()
    gc.disable()
    try:

        assert json.walk({"x": [1]}, change) == {"x": [1]}
        del change
        assert held() is None

    finally:

        if enabled: gc.enable()
