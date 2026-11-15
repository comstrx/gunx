from engine.error import Fault
from engine.number import Money, number
from contextlib import suppress
from decimal import Decimal, ROUND_HALF_UP, localcontext
from fractions import Fraction
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



@settings(max_examples=1000, deadline=None, database=None)
@given(st.text(alphabet="IVXLCDMivxlcdm !", max_size=80))
def roman_forms_are_canonical_or_refused ( raw: str ) -> None:

    try: value = number.from_roman(raw)
    except Fault: return

    assert 1 <= value <= 3999 and number.roman(value) == raw.strip().upper()

roman_forms_are_canonical_or_refused()

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.integers(-10**18, 10**18), st.integers(-10**8, 10**8), st.integers(0, 6))
def scaling_matches_exact_rational_arithmetic ( minor: int, coefficient: int, places: int ) -> None:

    with localcontext() as ctx:

        ctx.prec = 80
        factor = Decimal(coefficient).scaleb(-places)

    held = Money(minor, "USD")
    exact = Fraction(minor) * Fraction(factor)

    assert held.multiply(factor).minor == round(exact)
    assert held.percent(factor).minor == round(exact / 100)
    assert number.tax(held, abs(coefficient)).minor == round(Fraction(minor * abs(coefficient), 10000))

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.integers(-10**12, 10**12), st.lists(st.integers(0, 100), min_size=1, max_size=25))
def allocation_preserves_units_and_remainder_order ( minor: int, ratios: list[int] ) -> None:

    held = Money(minor, "USD")

    if not sum(ratios):

        with pytest.raises(Fault): held.allocate(ratios)

        return

    parts = held.allocate(ratios)
    exact = [Fraction(abs(minor) * ratio, sum(ratios)) for ratio in ratios]
    assert sum(part.minor for part in parts) == minor
    assert all(part.currency == held.currency for part in parts)
    assert [part.minor for part in held.negate().allocate(ratios)] == [-part.minor for part in parts]

    for part, ideal, ratio in zip(parts, exact, ratios, strict=True):

        assert abs(abs(part.minor) - ideal) < 1
        if ratio == 0: assert part.minor == 0

    fractions = [item % 1 for item in exact]
    rounded_up = [index for index, part in enumerate(parts) if abs(part.minor) > exact[index] // 1]
    rounded_down = [index for index, part in enumerate(parts) if abs(part.minor) == exact[index] // 1]

    for higher in rounded_up:

        for lower in rounded_down:

            assert fractions[higher] >= fractions[lower]
            if fractions[higher] == fractions[lower]: assert higher < lower

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.integers(-100000, 100000), st.integers(1, 10000), st.integers(0, 8))
def decimal_quotients_match_high_precision_reference ( numerator: int, denominator: int, places: int ) -> None:

    with localcontext() as ctx:

        ctx.prec = 100
        quantum = Decimal(1).scaleb(-places)
        quotient = (Decimal(numerator) / Decimal(denominator)).quantize(quantum, rounding=ROUND_HALF_UP)
        percent = (Decimal(numerator) * 100 / Decimal(denominator)).quantize(quantum, rounding=ROUND_HALF_UP)
        change = ((Decimal(numerator) - denominator) * 100 / denominator).quantize(quantum, rounding=ROUND_HALF_UP)

    assert number.divide(numerator, denominator, places=places) == quotient
    assert number.percent(numerator, denominator, places=places) == percent
    assert number.change(denominator, numerator, places=places) == change

@settings(max_examples=EXAMPLES, deadline=None, database=None)
@given(st.integers(-10**20, 10**20), st.integers(1, 50), st.sampled_from(["USD", "JPY", "KWD", "CLF"]))
def caller_context_cannot_change_money ( minor: int, precision: int, currency: str ) -> None:

    held = Money(minor, currency)
    expected = held.major()
    text = held.text()
    split = held.split(3)

    with localcontext() as ctx:

        ctx.prec = precision
        ctx.Emin = -2
        ctx.Emax = 2
        ctx.clamp = 1
        for signal in ctx.traps: ctx.traps[signal] = True

        flags = ctx.flags.copy()
        assert held.major() == expected and held.text() == text and held.split(3) == split
        assert number.money(expected, currency) == held
        assert number.parse_money(text) == held
        assert ctx.flags == flags

@settings(max_examples=1000, deadline=None, database=None)
@given(st.integers(-10000, 10000), st.integers(40, 160))
def monetary_half_boundaries_are_not_double_rounded ( whole: int, digits: int ) -> None:

    raw = f"{abs(whole)}.004" + "9" * digits
    value = Decimal(("-" if whole < 0 else "") + raw)

    with localcontext() as ctx:

        ctx.prec = 256
        expected = int((value * 100).quantize(Decimal(1), rounding=ROUND_HALF_UP))

    assert number.money(value, "USD").minor == expected

scaling_matches_exact_rational_arithmetic()
allocation_preserves_units_and_remainder_order()
decimal_quotients_match_high_precision_reference()
caller_context_cannot_change_money()
monetary_half_boundaries_are_not_double_rounded()

@settings(max_examples=1500, deadline=None, database=None)
@given(st.integers(min_value=-(10**12), max_value=10**12))
def exchanging_with_identity_rate_preserves_money ( minor: int ) -> None:

    made = number.minor(minor, "KWD")
    assert number.exchange(made, "KWD", "1") == made

exchanging_with_identity_rate_preserves_money()

@settings(max_examples=1500, deadline=None, database=None)
@given(st.integers(min_value=-(10**100), max_value=10**100), st.sampled_from(("USD", "JPY", "KWD", "CLF")))
def money_text_matches_decimal_formatting ( minor: int, currency: str ) -> None:

    held = Money(minor, currency)
    assert held.text() == f"{held.major():.{held.digits()}f} {currency}"

money_text_matches_decimal_formatting()

print("fuzz number  properties=13  ok")
