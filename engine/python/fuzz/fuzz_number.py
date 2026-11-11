from engine.error import Fault
from engine.number import Money, number
from contextlib import suppress
from decimal import Decimal
from hypothesis import HealthCheck, given, settings, strategies as st
from typing import Any, cast
import pytest

EXAMPLES = 4000
LIMIT    = 1e28
NUMERIC  = st.from_regex(r"[-+]?[0-9]{0,40}(\.[0-9]{0,40})?([eE][-+]?[0-9]{1,7})?", fullmatch=True)
WILD     = st.one_of(st.text(max_size=40), NUMERIC, st.sampled_from(["nan", "inf", "-inf", "sNaN", "Infinity"]))
PRICE    = Money(1999, "EGP")
CODE     = st.text(st.characters(exclude_categories=()), max_size=4)
STRAY    = st.one_of(
    st.none(), st.booleans(), st.integers(), st.floats(), CODE, st.binary(max_size=4), st.lists(st.integers(), max_size=2),
    st.sampled_from(["usd", "EGP", "Kwd", "\ufb03", "\u017far", "12", "1e3", "-0.5"]),
)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(WILD, st.sampled_from(["EGP", "USD", "KWD", "JPY", "??", ""]), st.integers(-3, 40))
def text_is_read_or_refused ( text: str, currency: str, places: int ) -> None:

    with suppress(Fault): number.decimal(text, places)
    with suppress(Fault): number.money(text, currency)
    with suppress(Fault): number.parse_money(text, currency or None)
    with suppress(Fault): number.from_roman(text)
    with suppress(Fault): number.spell(text)
    with suppress(Fault): number.spell(text, "ar")
    with suppress(Fault): number.trim(text)
    with suppress(Fault): number.divide(text, "3", places=2)
    with suppress(Fault): number.divide("3", text)
    with suppress(Fault): number.round_to(text, "0.05")
    with suppress(Fault): number.round_to("5", text)
    with suppress(Fault): PRICE.multiply(text)
    with suppress(Fault): PRICE.percent(text)
    with suppress(Fault): number.discount(PRICE, text)

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.integers(min_value=1, max_value=3999), st.integers(min_value=0, max_value=10**12), st.integers(0, 10000))
def money_keeps_every_minor_unit ( small: int, minor: int, bps: int ) -> None:

    assert number.from_roman(number.roman(small)) == small

    held = number.minor(minor, "EGP")
    half = number.minor(minor // 2, "EGP")
    rest = number.minor(minor - minor // 2, "EGP")

    assert number.total([half, rest]) == held
    assert number.parse_money(number.currency(held, "en", symbol=False), "EGP") == held
    assert number.money(held.major(), "EGP") == held
    assert number.tax(held, bps).currency == "EGP"
    assert sum(part.minor for part in held.split(7)) == minor
    assert sum(part.minor for part in held.allocate([1, 2, 3, bps])) == minor

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.decimals(allow_nan=False, allow_infinity=False, min_value=-10**20, max_value=10**20, places=6))
def decimals_survive_their_own_text ( value: Decimal ) -> None:

    assert number.decimal(str(value)) == value
    assert number.decimal(number.format(value, 6)) == value
    assert number.trim(value) == value
    assert number.spell(value)
    assert number.spell(value, "ar")

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(st.floats(allow_nan=False, allow_infinity=False), st.integers(0, 6))
def formats_never_crash ( value: float, places: int ) -> None:

    if abs(value) < LIMIT: assert number.decimal(number.format(value, places)) == number.decimal(value, places)
    else:

        with pytest.raises(Fault) as ranged: number.format(value, places)

        assert ranged.value.reason == "number.range"

    assert isinstance(number.compact(value, places), str)
    assert number.clamp(value, -1.0, 1.0) in (value, -1.0, 1.0)
    assert number.sign(value) in (-1, 0, 1)

    with suppress(Fault): number.bytes(int(value))
    with suppress(Fault): number.ordinal(int(value))

@settings(max_examples=EXAMPLES, deadline=None, database=None, suppress_health_check=list(HealthCheck))
@given(STRAY, STRAY)
def money_is_sound_or_refused ( minor: object, currency: object ) -> None:

    for build in (Money, number.minor, number.money):

        with suppress(Fault):

            held = build(cast("Any", minor), cast("Any", currency))

            assert type(held.minor) is int
            assert type(held.currency) is str
            assert len(held.currency) == 3
            assert held.currency.isascii()
            assert held.currency.isalpha()
            assert held.currency.isupper()
            assert held.text().endswith(f" {held.currency}")
            assert held.dump() == { "minor": held.minor, "currency": held.currency }

text_is_read_or_refused()
money_is_sound_or_refused()
money_keeps_every_minor_unit()
decimals_survive_their_own_text()
formats_never_crash()

print(f"fuzz number  examples={EXAMPLES * 5}  ok")
