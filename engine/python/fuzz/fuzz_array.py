from engine.array import array
from engine.error import Fault
from hypothesis import HealthCheck, given, settings, strategies as st
from contextlib import suppress
from typing import cast
from collections import UserDict
from types import MappingProxyType, SimpleNamespace
import pytest

EXAMPLES = 3400
ITEMS    = st.lists(st.integers(min_value=-50, max_value=50), max_size=40)
ROWS     = st.lists(st.fixed_dictionaries({ "id": st.integers(0, 9), "name": st.text(max_size=6) }), max_size=20)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(ITEMS, st.integers(min_value=-3, max_value=12))
def slices_keep_every_item ( items: list[int], size: int ) -> None:

    with suppress(Fault): assert [item for part in array.chunk(items, size) for item in part] == items
    with suppress(Fault): assert [item for part in array.split(items, size) for item in part] == items
    with suppress(Fault): assert sorted(array.rotate(items, size)) == sorted(items)

    kept, dropped = array.partition(items, lambda item: item % 2 == 0)

    assert sorted(kept + dropped) == sorted(items)
    assert list(array.take(items, size)) + list(array.skip(items, size)) == items or size < 0

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(ITEMS, ITEMS)
def sets_agree_with_the_builtin ( left: list[int], right: list[int] ) -> None:

    assert set(array.intersect(left, right)) == set(left) & set(right)
    assert set(array.union(left, right)) == set(left) | set(right)
    assert set(array.difference(left, right)) == set(left) - set(right)
    assert len(array.unique(left)) == len(set(left))
    assert sum(array.count_by(left).values()) == len(left)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(ROWS, st.sampled_from(["=", "!=", ">", "<", ">=", "<=", "in", "like", "??"]), st.integers(0, 9))
def rows_never_crash ( rows: list[dict[str, object]], operator: str, value: int ) -> None:

    with suppress(Fault): array.where(rows, "id", operator, value)

    grouped = array.group(rows, "id")

    assert sum(len(found) for found in grouped.values()) == len(rows)
    assert array.pluck(rows, "id") == [row["id"] for row in rows]
    assert [row["id"] for row in array.sort(rows, "id")] == sorted(cast("int", row["id"]) for row in rows)

@settings(max_examples=400, deadline=None, database=None)
@given(ITEMS)
def sole_counts_without_collecting ( items: list[int] ) -> None:

    if len(items) == 1: assert array.sole(iter(items)) == items[0]
    else:

        with pytest.raises(Fault) as caught: array.sole(iter(items))

        assert caught.value.reason == "array.sole"
        if items: assert caught.value.errors == { "count": [str(len(items))] }

sole_counts_without_collecting()

slices_keep_every_item()
sets_agree_with_the_builtin()
rows_never_crash()


@settings(max_examples=1500, deadline=None, database=None)
@given(st.lists(st.one_of(st.none(), st.integers()), max_size=200))
def streaming_aggregates_preserve_builtin_results ( values: list[int | None] ) -> None:

    real = [value for value in values if value is not None]
    assert array.sum(iter(values)) == sum(real)
    assert array.min(iter(values)) == min(real, default=None)
    assert array.max(iter(values)) == max(real, default=None)

streaming_aggregates_preserve_builtin_results()

@settings(max_examples=1000, deadline=None, database=None)
@given(st.lists(st.one_of(st.none(), st.integers(-100, 100)), max_size=80))
def order_statistics_match_materialized_reference ( values: list[int | None] ) -> None:

    real = sorted(value for value in values if value is not None)
    middle = len(real) // 2
    expected = None if not real else real[middle] if len(real) % 2 else (real[middle - 1] + real[middle]) / 2
    assert array.median(iter(values)) == expected
    kept = [value for value in values if value is not None]
    winner = max(dict.fromkeys(kept), key=kept.count) if kept else None
    assert array.mode(iter(values)) == winner

order_statistics_match_materialized_reference()


@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(ROWS, st.sampled_from(["id", "name", "missing"]))
def getters_agree_for_mapping_and_object_rows ( rows: list[dict[str, object]], name: str ) -> None:

    expected = [row.get(name) for row in rows]
    assert array.pluck(rows, name) == expected
    assert array.pluck([UserDict(row) for row in rows], name) == expected
    assert array.pluck([MappingProxyType(row) for row in rows], name) == expected
    assert array.pluck([SimpleNamespace(**row) for row in rows], name) == expected

getters_agree_for_mapping_and_object_rows()

print("fuzz array  properties=7  ok")
