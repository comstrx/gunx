from engine.error import Code, Fault
from engine.json import json
from engine.string import string
from typing import Any
import pytest

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

    json.use(lambda value: "odd" if isinstance(value, Odd) else None)

    assert json.encode([Money(), Odd()]) == b'[{"minor":5},"odd"]'
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
    assert json.diff(1, "1") == [{ "op": "replace", "path": "/", "value": "1" }] and json.patch(1, json.diff(1, "1")) == "1"
    assert json.patch({ "a": [1] }, [{ "op": "add", "path": "/a/0", "value": 0 }, { "op": "remove", "path": "/zz" }]) == { "a": [0, 1] }

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
