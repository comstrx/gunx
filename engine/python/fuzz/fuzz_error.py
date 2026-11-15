from engine.error import Bag, Code, Fault
from hypothesis import given, settings, strategies as st
from http import HTTPStatus
from typing import cast
from collections.abc import Callable
import json, math

EXAMPLES = 4000
TEXT     = st.text(max_size=40)
ERRORS   = st.dictionaries(st.text(max_size=8), st.lists(TEXT, max_size=4), max_size=5)
VALUES   = st.recursive(
    st.none() | st.booleans() | st.integers() | st.floats() | TEXT,
    lambda children: st.lists(children, max_size=5) | st.dictionaries(st.text(max_size=8), children, max_size=5),
    max_leaves=20,
)
WIRE = st.fixed_dictionaries({}, optional=dict.fromkeys(
    ("code", "message", "reason", "errors", "status", "retry_after", "unknown", "headers", "extra"), VALUES,
))

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(WIRE | VALUES)
def foreign_data_loads_or_has_a_typed_refusal ( payload: object ) -> None:

    made: Fault | None = None
    failed: Fault | None = None

    try: made = Fault.load(payload)
    except Fault as error: failed = error

    if failed is not None:

        assert failed.code is Code.VALIDATION and failed.reason == "error.payload" and failed.errors

    else:

        assert made is not None
        assert isinstance(cast("object", made.code), Code) and isinstance(cast("object", made.status), HTTPStatus)
        assert type(cast("object", made.unknown)) is bool and Fault.load(made.dump()).dump() == made.dump()

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(
    st.sampled_from(list(Code)), TEXT, TEXT, ERRORS, st.sampled_from(list(HTTPStatus)),
    st.none() | st.floats(min_value=0, max_value=86400, allow_nan=False, allow_infinity=False),
    st.booleans(), st.dictionaries(st.text(max_size=8), TEXT, max_size=4),
)
def operational_state_round_trips_without_aliases (
    code: Code, message: str, reason: str, errors: dict[str, list[str]], status: HTTPStatus,
    retry_after: float | None, unknown: bool, headers: dict[str, str],
) -> None:

    made  = Fault(code, message or None, reason, errors, status, retry_after=retry_after, unknown=unknown, headers=headers)
    wire  = made.dump()
    again = Fault.load(json.loads(json.dumps(wire)))

    assert again.dump() == made.dump()
    assert again.safe() == made.safe() and again.safe(idempotent=True) == made.safe(idempotent=True)

    if errors:

        key = next(iter(errors))

        cast("dict[str, list[str]]", wire["errors"])[key].append("changed")

        assert made.errors == errors and again.errors == errors

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(ERRORS, ERRORS, st.lists(st.tuples(st.text(max_size=8), TEXT), max_size=8))
def bags_match_an_independent_collection (
    initial: dict[str, list[str]], extra: dict[str, list[str]], additions: list[tuple[str, str]],
) -> None:

    pairs = [(key, text) for key, texts in initial.items() for text in texts]
    pairs += [(key, text) for key, texts in extra.items() for text in texts]
    pairs += additions
    expected: dict[str, list[str]] = {}

    for key, text in pairs:

        if key not in expected: expected[key] = []

        expected[key].append(text)

    bag = Bag(initial).extend(extra)

    for key, text in additions: bag.add(key, text)

    assert bag.dump() == expected and bag.count() == len(pairs) and len(bag) == len(expected)
    assert bool(bag) == bool(pairs) and bag.has() == bool(pairs)

    if pairs:

        before = bag.fault()

        bag.add("later", "extra")

        assert before.errors == expected

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.sampled_from(list(Code)), ERRORS, TEXT, st.booleans())
def explicit_copy_changes_do_not_mutate_the_source (
    code: Code, errors: dict[str, list[str]], reason: str, unknown: bool,
) -> None:

    made = Fault(code, reason=reason, errors=errors, retry_after=2, unknown=unknown)
    twin = made.copy()
    clean = made.copy(reason=None, errors=None, retry_after=None, unknown=False)

    assert twin.dump() == made.dump()
    assert clean.reason is None and clean.errors is None and clean.retry_after is None and not clean.unknown
    assert made.reason == reason and made.errors == (errors or None) and made.retry_after == 2 and made.unknown == unknown

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(VALUES)
def status_classification_never_treats_invalid_values_as_success ( status: object ) -> None:

    code = Code.of(cast("int", status))

    if not isinstance(status, int) or not 100 <= status <= 599:

        assert code is Code.INTERNAL

    elif 400 <= status < 500:

        assert code.client()

    elif status >= 500:

        assert code.server()

    else:

        assert code.success()

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.text(), st.sampled_from([None, *Code]))
def code_parsing_preserves_normalization_and_fallbacks ( text: str, fallback: Code | None ) -> None:

    normal = text.strip().lower().replace("-", "_").replace(" ", "_")
    expected = next((code for code in Code if code.value == normal), fallback)

    assert Code.parse(text, fallback) is expected



@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(VALUES)
def retry_delays_share_the_same_boundary ( value: object ) -> None:

    valid = value is None

    if type(value) in (int, float):

        try: valid = math.isfinite(float(cast("int | float", value))) and cast("int | float", value) >= 0
        except OverflowError: valid = False

    outcomes: list[Fault] = []
    factories: tuple[Callable[[], Fault], ...] = (
        lambda: Fault(Code.UNAVAILABLE, retry_after=cast("float | None", value), unknown=True),
        lambda: Fault.load({ "code": "unavailable", "retry_after": value, "unknown": True }),
        lambda: Fault(Code.UNAVAILABLE, unknown=True).copy(retry_after=cast("float | None", value)),
    )

    for make in factories:

        made: Fault | None = None
        refused: Fault | None = None

        try: made = make()
        except Fault as error: refused = error

        if valid:

            assert made is not None and refused is None
            outcomes.append(made)

        else: assert refused is not None and refused.reason == "error.payload"

    if valid: assert outcomes[0].dump() == outcomes[1].dump() == outcomes[2].dump()


foreign_data_loads_or_has_a_typed_refusal()
operational_state_round_trips_without_aliases()
bags_match_an_independent_collection()
explicit_copy_changes_do_not_mutate_the_source()

status_classification_never_treats_invalid_values_as_success()
code_parsing_preserves_normalization_and_fallbacks()

retry_delays_share_the_same_boundary()

print("fuzz error  properties=7  max_examples=per-property settings  ok")
