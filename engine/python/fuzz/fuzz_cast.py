from decimal import Decimal
from engine.cast import cast
from engine.error import Fault
from hypothesis import given, settings, strategies as st
from contextlib import suppress

EXAMPLES = 3000

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.integers(min_value=-(10**100), max_value=10**100))
def integers_round_trip ( value: int ) -> None:

    assert cast.integer(cast.text(value)) == value

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.text(max_size=200))
def boundaries_only_return_values_or_typed_errors ( text: str ) -> None:

    for convert in (cast.integer, cast.number, cast.boolean, cast.decimal, cast.dict):
        with suppress(Fault): convert(text)

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.integers(min_value=-(10**12), max_value=10**12), st.sampled_from(("USD", "JPY", "KWD", "CLF")))
def monetary_minor_units_survive_round_trips ( minor: int, code: str ) -> None:

    made = cast.money(minor, code, minor=True)
    assert cast.money(made.dump()) == made
    assert cast.money(made.major(), code) == made
    assert isinstance(cast.decimal(made), Decimal)

integers_round_trip()
boundaries_only_return_values_or_typed_errors()
monetary_minor_units_survive_round_trips()

@settings(max_examples=1500, deadline=None, database=None)
@given(st.lists(st.integers(), max_size=100), st.dictionaries(st.text(max_size=20), st.integers(), max_size=30))
def fast_container_conversions_keep_detached_outer_ownership ( values: list[int], fields: dict[str, int] ) -> None:

    rows = cast.list(values)
    mapping = cast.dict(fields)
    assert rows == values and rows is not values
    assert mapping == fields and mapping is not fields
    assert cast.list(tuple(values), using=lambda value: value + 1) == [value + 1 for value in values]

fast_container_conversions_keep_detached_outer_ownership()



@settings(max_examples=1000, deadline=None, database=None)
@given(st.lists(st.integers(), max_size=40))
def callbacks_cannot_extend_the_conversion_work ( values: list[int] ) -> None:

    source = list(values)
    def convert ( value: int ) -> int:

        source.append(value)

        return value

    assert cast.list(source, using=convert, limit=len(values)) == values
    assert source == values + values

callbacks_cannot_extend_the_conversion_work()

print("fuzz cast  properties=5  ok")
