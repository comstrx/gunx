from engine.array import array
from engine.error import Fault
from hypothesis import HealthCheck, given, settings, strategies as st
from contextlib import suppress
from typing import cast

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

slices_keep_every_item()
sets_agree_with_the_builtin()
rows_never_crash()

print(f"fuzz array  examples={EXAMPLES * 3}  ok")
