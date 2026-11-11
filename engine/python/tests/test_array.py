from dataclasses import dataclass

from engine.array import Page, array
from engine.error import Code, Fault
import pytest

@dataclass(frozen=True)
class Item:

    id    : int
    name  : str
    price : int | None = None

ROWS = [{ "id": 1, "name": "apple", "price": 10 }, { "id": 2, "name": "pear", "price": None }, { "id": 3, "name": "avocado", "price": 30 }]

def test_shapes_sequences () -> None:

    assert list(array.chunk([1, 2, 3, 4, 5], 2)) == [[1, 2], [3, 4], [5]]
    assert array.unique([3, 1, 3, 2, 1]) == [3, 1, 2]
    assert array.unique([{ "id": 1 }, { "id": 1 }, { "id": 2 }], lambda item: item["id"]) == [{ "id": 1 }, { "id": 2 }]
    assert array.unique(ROWS + ROWS[:1], "id") == ROWS and array.duplicates([1, 2, 1, 3, 2]) == [1, 2]
    assert array.group(["aa", "b", "cc"], len) == { 2: ["aa", "cc"], 1: ["b"] }
    assert array.index([{ "id": 1 }], lambda item: item["id"]) == { 1: { "id": 1 } } and array.index(ROWS, "id")[2]["name"] == "pear"
    assert array.flatten([[1], [2, 3], []]) == [1, 2, 3] and array.flatten([[1, [2, [3]]]]) == [1, [2, [3]]]
    assert array.flatten([[1, [2, [3]]]], depth=-1) == [1, 2, 3] and array.flatten([(1, 2), { 3 }], 2) == [1, 2, 3]
    assert array.compact([1, None, 2]) == [1, 2] and array.wrap(None) == [] and array.wrap(1) == [1] and array.wrap((1, 2)) == [1, 2]
    assert array.pluck([{ "n": 1 }, { "n": 2 }], "n") == [1, 2] and array.pluck(ROWS, "name", "id") == { 1: "apple", 2: "pear", 3: "avocado" }
    assert array.pluck([Item(1, "x")], "name") == ["x"] and array.pluck([Item(1, "x")], "missing") == [None]
    assert array.first([], 9) == 9 and array.first([1, 2]) == 1 and array.last([1, 2]) == 2 and array.last([]) is None
    assert array.get([1, 2], 1) == 2 and array.get([1, 2], -2) == 1 and array.get([1, 2], 5, 0) == 0
    assert array.partition([1, 2, 3, 4], lambda n: n % 2 == 0) == ([2, 4], [1, 3])
    assert list(array.window([1, 2, 3], 2)) == [[1, 2], [2, 3]] and list(array.window([1], 2)) == []
    assert array.take([1, 2, 3], 2) == [1, 2] and array.take([1, 2, 3], -1) == [3] and array.skip([1, 2, 3], 2) == [3]
    assert array.nth([1, 2, 3, 4, 5], 2) == [1, 3, 5] and array.nth([1, 2, 3, 4], 2, 1) == [2, 4]
    assert array.pad([1], 3) == [1, None, None] and array.pad([1], -3, 0) == [0, 0, 1] and array.pad([1, 2], 1) == [1, 2]
    assert array.prepend([2, 3], 0, 1) == [0, 1, 2, 3] and array.rotate([1, 2, 3], 1) == [2, 3, 1] and array.rotate([], 2) == []
    assert array.interleave([1, 3], [2, 4, 5]) == [1, 2, 3, 4, 5] and array.cross([1, 2], ["a"]) == [(1, "a"), (2, "a")]
    assert array.transpose([[1, 2], [3, 4]]) == [[1, 3], [2, 4]] and array.split([1, 2, 3, 4, 5], 2) == [[1, 2, 3], [4, 5]]
    assert array.chunk_by([1, 1, 2, 3, 3], lambda n: n) == [[1, 1], [2], [3, 3]] and array.chunk_by([], str) == []
    assert array.times(3, lambda n: n * n) == [1, 4, 9] and array.join([1, 2, 3]) == "1, 2, 3"
    assert array.join(["a", "b", "c"], ", ", " and ") == "a, b and c" and array.join(["a"], ", ", " and ") == "a"
    assert array.only({ "a": 1, "b": 2 }, "a", "z") == { "a": 1 } and array.omit({ "a": 1, "b": 2 }, "a") == { "b": 2 }

    for bad in (lambda: list(array.chunk([1], 0)), lambda: array.split([1], 0), lambda: array.nth([1], 0)):

        with pytest.raises(Fault): bad()

def test_queries_and_aggregates () -> None:

    assert array.where(ROWS, "name", "apple") == ROWS[:1] and array.where(ROWS, "price", ">", 10) == ROWS[2:]
    assert array.where(ROWS, "price", ">=", 10) == [ROWS[0], ROWS[2]] and array.where(ROWS, "price", "<", 20) == ROWS[:1]
    assert array.where(ROWS, "price", "<=", 10) == ROWS[:1] and array.where(ROWS, "price", "!=", 10) == ROWS[1:]
    assert array.where(ROWS, "name", "like", "a*") == [ROWS[0], ROWS[2]] and array.where(ROWS, "name", "contains", "ea") == ROWS[1:2]
    assert array.where(ROWS, "name", "starts", "av") == ROWS[2:] and array.where(ROWS, "name", "ends", "e") == [ROWS[0]]
    assert array.where(ROWS, "price", "between", (5, 15)) == ROWS[:1] and array.where(ROWS, "id", "in", [1, 3]) == [ROWS[0], ROWS[2]]
    assert array.where_in(ROWS, "id", (2,)) == ROWS[1:2] and array.where_not_in(ROWS, "id", (2,)) == [ROWS[0], ROWS[2]]
    assert array.first_where(ROWS, "price", None) == ROWS[1] and array.first_where(ROWS, "id", 9) is None
    assert array.where([Item(1, "x", 5), Item(2, "y")], "price", ">", 1) == [Item(1, "x", 5)]

    with pytest.raises(Fault) as bad: array.where(ROWS, "id", "~", 1)

    assert bad.value.reason == "array.operator"

    assert array.sort([3, 1, 2]) == [1, 2, 3] and array.sort(ROWS, "name", reverse=True)[0]["name"] == "pear"
    assert array.sort(ROWS, lambda row: row["id"], reverse=True)[0]["id"] == 3
    assert array.min_by(ROWS, "id") == ROWS[0] and array.max_by(ROWS, "id") == ROWS[2] and array.min_by([], "id") is None
    assert array.sum([1, 2, 3]) == 6 and array.sum(ROWS, "price") == 40 and array.avg(ROWS, "price") == 20 and array.avg([]) is None
    assert array.min(ROWS, "price") == 10 and array.max(ROWS, "price") == 30 and array.max([]) is None
    assert array.median([3, 1, 2]) == 2 and array.median([1, 2, 3, 4]) == 2.5 and array.median([]) is None
    assert array.mode([1, 2, 2, 3]) == 2 and array.mode([]) is None
    assert array.count_by(["a", "b", "a"]) == { "a": 2, "b": 1 } and array.count_by(ROWS, lambda row: row["price"] is None) == { False: 2, True: 1 }
    assert array.keep([1, 2, 3], lambda n: n > 1) == [2, 3] and array.reject([1, 2, 3], lambda n: n > 1) == [1]
    assert array.every([2, 4], lambda n: n % 2 == 0) and not array.some([1, 3], lambda n: n % 2 == 0) and array.every([], bool)
    assert array.search([1, 2, 3], lambda n: n == 2) == 1 and array.search([], bool) == -1
    assert array.sole([1, 2, 3], lambda n: n == 2) == 2 and array.sole([7]) == 7

    with pytest.raises(Fault) as none: array.sole([], bool)
    with pytest.raises(Fault) as many: array.sole([1, 1])

    assert none.value.code is Code.NOT_FOUND and many.value.code is Code.CONFLICT

def test_pages_and_sets () -> None:

    page = array.page(45, 2, 20)

    assert page == Page(2, 20, 45) and page.pages() == 3 and page.offset() == 20
    assert page.dump() == { "page": 2, "limit": 20, "total": 45, "pages": 3 }
    assert array.page(0).pages() == 1

    rows, made = array.paginate(list(range(45)), 3, 20)

    assert rows == list(range(40, 45)) and made == Page(3, 20, 45)

    for bad in ((10, 0, 20), (10, 1, 0), (10, 1, 10_000), (-1, 1, 20)):

        with pytest.raises(Fault): array.page(*bad)

    assert array.intersect([1, 2, 3, 2**40], [2, 3, 4, 2**40]) == [2, 3, 2**40]
    assert array.union([1], [2, 1]) == [1, 2] and array.difference([1, 2, 3], [2]) == [1, 3]
    assert array.union([3, 1], [2]) == [1, 2, 3] and array.intersect([], [1]) == []
    assert array.intersect(["b", "a", "b"], ["a", "b"]) == ["a", "b"] and array.difference(["b", "a"], ["a"]) == ["b"]
    assert array.union(["b"], ["a"]) == ["a", "b"] and array.intersect([1, "a"], ["a", 1]) == [1, "a"]
    assert array.difference([-1, 2], [2]) == [-1]

def test_the_laravel_lap_of_array_verbs () -> None:

    assert array.after([1, 2, 3], 2) == 3 and array.after([1, 2, 3], 3) is None and array.after([1], 9) is None
    assert array.before([1, 2, 3], 2) == 1 and array.before([1, 2, 3], 1) is None
    assert array.divide({ "a": 1, "b": 2 }) == (["a", "b"], [1, 2])
    assert array.flat_map([1, 2], lambda n: [n, n * 10]) == [1, 10, 2, 20]
    assert array.percentage([1, 2, 3, 4], lambda n: n % 2 == 0) == 50.0 and array.percentage([], bool) == 0.0
    assert array.skip_while([1, 2, 3, 1], lambda n: n < 3) == [3, 1] and array.skip_until([1, 2, 3, 1], lambda n: n == 3) == [3, 1]
    assert array.take_while([1, 2, 3, 1], lambda n: n < 3) == [1, 2] and array.take_until([1, 2, 3, 1], lambda n: n == 3) == [1, 2]
    assert array.splice([1, 2, 3, 4], 1, 2, [9]) == ([1, 9, 4], [2, 3]) and array.splice([1, 2, 3], 1) == ([1], [2, 3])
    assert array.unwrap([7]) == 7 and array.unwrap([7, 8]) == [7, 8] and array.unwrap("x") == "x"

def test_first_and_last_take_a_predicate_and_compact_takes_places () -> None:

    assert array.first([100, 200, 300], check=lambda v: v >= 150) == 200 and array.last([100, 200, 300], check=lambda v: v >= 150) == 300
    assert array.first([1, 2], check=lambda v: v > 5) is None and array.last([1, 2], 0, lambda v: v > 5) == 0

def test_laravel_arr_examples_behave_the_same () -> None:

    assert array.flatten([[1, 2, 3], [4, 5, 6], [7, 8, 9]]) == [1, 2, 3, 4, 5, 6, 7, 8, 9]
    assert array.cross([1, 2], ["a", "b"]) == [(1, "a"), (1, "b"), (2, "a"), (2, "b")]
    assert array.divide({ "name": "Desk" }) == (["name"], ["Desk"])
    assert array.omit({ "name": "Desk", "price": 100 }, "price") == { "name": "Desk" }
    assert array.first([100, 200, 300], check=lambda value: value >= 150) == 200
    assert array.flatten(list({ "name": "Joe", "languages": ["PHP", "Ruby"] }.values())) == ["Joe", "PHP", "Ruby"]
    assert array.join(["Tailwind", "Alpine", "Laravel", "Livewire"], ", ", " and ") == "Tailwind, Alpine, Laravel and Livewire"
    assert array.index([{ "product_id": "prod-100", "name": "Desk" }], "product_id") == { "prod-100": { "product_id": "prod-100", "name": "Desk" } }
    assert array.last([100, 200, 300], check=lambda value: value >= 150) == 300
    assert array.only({ "name": "Desk", "price": 100, "orders": 10 }, "name", "price") == { "name": "Desk", "price": 100 }
    assert array.pluck([{ "developer": { "name": "Taylor" } }, { "developer": { "name": "Abigail" } }], "developer.name") == ["Taylor", "Abigail"]
    assert array.pluck([{ "developer": { "id": 1, "name": "Taylor" } }], "developer.name", "developer.id") == { 1: "Taylor" }
    assert array.prepend(["one", "two", "three", "four"], "zero") == ["zero", "one", "two", "three", "four"]
    assert array.sort(["Desk", "Table", "Chair"]) == ["Chair", "Desk", "Table"]
    assert array.sort([{ "name": "Desk" }, { "name": "Table" }, { "name": "Chair" }], "name")[0] == { "name": "Chair" }
    assert array.take([0, 1, 2, 3, 4, 5], 3) == [0, 1, 2] and array.take([0, 1, 2, 3, 4, 5], -2) == [4, 5]
    assert array.keep([100, "200", 300, "400", 500], lambda value: isinstance(value, str)) == ["200", "400"]
    assert array.wrap("Laravel") == ["Laravel"] and array.wrap(None) == [] and array.wrap(["a"]) == ["a"]
    assert array.where([{ "price": 100 }, { "price": 200 }], "price", ">", 150) == [{ "price": 200 }]

def test_laravel_collection_examples_behave_the_same () -> None:

    assert array.avg([1, 1, 2, 4]) == 2 and array.sum([1, 2, 3]) == 6 and array.median([1, 1, 2, 4]) == 1.5
    assert list(array.chunk([1, 2, 3, 4, 5, 6, 7], 4)) == [[1, 2, 3, 4], [5, 6, 7]]
    assert array.count_by([1, 2, 2, 2, 3]) == { 1: 1, 2: 3, 3: 1 }
    assert array.difference([1, 2, 3, 4, 5], [2, 4, 6, 8]) == [1, 3, 5]
    assert array.duplicates(["a", "b", "a", "c", "b"]) == ["a", "b"]
    assert not array.every([1, 2, 3, 4], lambda value: value > 2) and array.some([1, 2, 3, 4], lambda value: value > 2)
    assert array.mode([1, 1, 2, 4]) == 1 and array.nth(["a", "b", "c", "d", "e", "f"], 4) == ["a", "e"]
    assert array.pad([1, 2, 3], 5, 0) == [1, 2, 3, 0, 0]
    assert array.partition([1, 2, 3, 4, 5, 6], lambda value: value < 3) == ([1, 2], [3, 4, 5, 6])
    assert array.percentage([1, 1, 2, 2, 2, 3], lambda value: value == 1) == 33.33
    assert list(array.window([1, 2, 3, 4, 5], 2)) == [[1, 2], [2, 3], [3, 4], [4, 5]]
    assert array.times(3, lambda n: n * 9) == [9, 18, 27]
    assert array.where_in([{ "price": 100 }, { "price": 150 }], "price", [150, 200]) == [{ "price": 150 }]
    assert array.take_until([1, 2, 3, 4], lambda value: value == 3) == [1, 2]
    assert array.skip_while([1, 2, 3, 4], lambda value: value <= 2) == [3, 4]
    assert array.splice([1, 2, 3, 4, 5], 2) == ([1, 2], [3, 4, 5]) and array.splice([1, 2, 3, 4, 5], 2, 1, [10, 11]) == ([1, 2, 10, 11, 4, 5], [3])
    assert array.unique([1, 1, 2, 2, 3, 4, 2]) == [1, 2, 3, 4] and array.flat_map([1, 2], lambda n: [n] * n) == [1, 2, 2]
    assert array.after([1, 2, 3, 4], 3) == 4 and array.before([1, 2, 3, 4], 3) == 2 and array.after([1, 2, 3], 3) is None
