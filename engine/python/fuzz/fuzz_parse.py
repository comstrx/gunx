from engine.error import Fault
from engine.parse import parse
from hypothesis import HealthCheck, given, settings, strategies as st
from contextlib import suppress

EXAMPLES = 10000

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.text(max_size=80))
def never_crashes_on_text ( text: str ) -> None:

    for reader in (parse.integer, parse.number, parse.boolean, parse.duration, parse.size, parse.semver):

        with suppress(Fault): reader(text)

    parse.query(text)
    parse.keys(text)
    parse.list(text)

    with suppress(Fault): parse.url(text)
    with suppress(Fault): parse.toml(text)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.integers(min_value=-10**12, max_value=10**12), st.floats(allow_nan=False, allow_infinity=False, width=32))
def numbers_round_trip ( whole: int, real: float ) -> None:

    assert parse.integer(str(whole)) == whole
    assert parse.number(repr(real)) == real

never_crashes_on_text()
numbers_round_trip()


@settings(max_examples=1000, deadline=None, database=None)
@given(st.lists(st.one_of(st.none(), st.booleans(), st.integers(), st.text(max_size=32)), max_size=32))
def lists_keep_the_nonblank_scalar_representation ( items: list[object] ) -> None:

    expected = [str(item).strip() for item in items if str(item).strip()]

    assert parse.list(items) == expected and parse.list(tuple(items)) == expected

lists_keep_the_nonblank_scalar_representation()

@settings(max_examples=1000, deadline=None, database=None)
@given(st.dictionaries(
    st.text(alphabet="abcdef", min_size=1, max_size=8),
    st.one_of(st.booleans(), st.integers(min_value=-(2**31), max_value=2**31), st.text(alphabet="abcdef 0123", max_size=40)),
    max_size=15,
))
def formats_round_trip_their_common_data_model ( fields: dict[str, object] ) -> None:

    for kind in ("json", "toml", "yaml"):
        assert parse.loads(parse.dumps(fields, kind), kind) == fields

formats_round_trip_their_common_data_model()

@settings(max_examples=2000, deadline=None, database=None)
@given(st.text(max_size=200))
def malformed_documents_return_values_or_typed_faults ( text: str ) -> None:

    for kind in ("json", "yaml", "toml"):

        with suppress(Fault): parse.loads(text, kind)

malformed_documents_return_values_or_typed_faults()

@settings(max_examples=1000, deadline=None, database=None)
@given(st.text(alphabet="abc {}_*[]0123456789", max_size=100))
def rendered_documents_keep_inserted_text_literal_in_every_format ( value: str ) -> None:

    document = parse.of({"{ key }": ("__ value __",)})
    document.render({"key": "name"}, keys=True, strict=False)
    document.render({"value": value}, delimiters=("__", "__"))
    for kind in ("json", "toml", "yaml"):
        assert parse.loads(document.text(kind), kind) == {"name": [value]}

rendered_documents_keep_inserted_text_literal_in_every_format()

print("fuzz parse  properties=6  ok")
