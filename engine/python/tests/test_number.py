from collections.abc import Callable
from decimal import Decimal, InvalidOperation, ROUND_DOWN, localcontext
from typing import Any, cast

from engine.error import Code, Fault
from engine.number import Money, number
from engine.string import string
import operator, pytest

READERS: tuple[Callable[[Any], object], ...] = (
    number.decimal, number.spell, number.trim, number.format, lambda held: number.money(held, "EGP"),
)

def test_decimals_are_exact_and_bounded () -> None:

    assert number.decimal("1,234.5") == Decimal("1234.5") and number.decimal(" 2 ", 2) == Decimal("2.00")
    assert number.quantize(Decimal("2.345"), 2) == Decimal("2.35") and number.quantize(Decimal("2.345"), 2, banker=True) == Decimal("2.34")
    assert number.round_minor(Decimal("10.5")) == 10 and number.round_minor(Decimal("11.5")) == 12
    assert number.round_to("17", 5) == 15 and number.round_to("2.26", "0.05") == Decimal("2.25") and number.round_to(13, 5) == 15
    assert number.percent(1, 3) == Decimal("33.33") and number.percent(1, 0) == 0
    assert number.change(100, 125) == Decimal("25.00") and number.change(100, 75) == Decimal("-25.00") and number.change(0, 5) is None
    assert number.format(1234567.891) == "1,234,567.89" and number.format(1000, 0, ".", ",") == "1.000"
    assert number.compact(999) == "999" and number.compact(1500) == "1.5K" and number.compact(2_000_000) == "2M"
    assert number.bytes(1024) == "1 KiB" and number.bytes(1536) == "1.5 KiB" and number.bytes(5) == "5 B"
    assert number.ordinal(1) == "1st" and number.ordinal(12) == "12th" and number.ordinal(23) == "23rd"
    assert number.clamp(15, 0, 10) == 10 and number.between(5, 1, 10) and not number.between(0, 1, 10)
    assert number.sign(-3) == -1 and number.sign(0) == 0 and number.sign(Decimal("2.5")) == 1 and number.pad(7, 3) == "007"
    assert number.roman(1994) == "MCMXCIV" and number.roman(4) == "IV" and number.from_roman("mcmxciv") == 1994

    for bad in ("x", True, float("nan"), "1..2"):

        with pytest.raises(Fault) as caught: number.decimal(bad)

        assert caught.value.code is Code.BAD_REQUEST and caught.value.reason == "number.decimal"

    for bad_roman in ("IIII", "", "ABC"):

        with pytest.raises(Fault): number.from_roman(bad_roman)

    with pytest.raises(Fault): number.roman(0)
    with pytest.raises(Fault): number.round_to(1, 0)

def test_money_lives_in_minor_units () -> None:

    price = number.money("19.99", "usd")

    assert price == Money(1999, "USD") and price.major() == Decimal("19.99") and price.text() == "19.99 USD"
    assert number.money("1.5", "KWD").minor == 1500 and number.money(100, "JPY").minor == 100
    assert price.add(Money(1, "USD")).minor == 2000 and price.subtract(Money(1999, "USD")).zero()
    assert price.multiply("3").minor == 5997 and price.percent(10).minor == 200
    assert [m.minor for m in Money(100, "USD").split(3)] == [34, 33, 33]
    assert [m.minor for m in Money(100, "USD").allocate([1, 1, 1])] == [34, 33, 33]
    assert [m.minor for m in Money(5, "USD").allocate([3, 7])] == [2, 3] and [m.minor for m in Money(-5, "USD").allocate([3, 7])] == [-2, -3]
    assert [m.minor for m in Money(1000, "EGP").allocate([70, 20, 10])] == [700, 200, 100]
    assert number.total([Money(1, "EGP"), Money(2, "EGP")]) == Money(3, "EGP")
    assert number.minor(5, "egp").currency == "EGP" and Money(-1, "USD").negative()
    assert price.dump() == { "minor": 1999, "currency": "USD" }
    assert Money(1, "USD") < Money(2, "USD") and Money(1, "USD").compare(Money(2, "USD")) == -1 and price.compare(price) == 0
    assert Money(-5, "USD").absolute() == Money(5, "USD") and Money(5, "USD").negate() == Money(-5, "USD")
    assert number.tax(Money(10000, "EGP"), 1400) == Money(1400, "EGP") and number.discount(Money(1000, "EGP"), 25) == Money(750, "EGP")

    with pytest.raises(Fault) as mixed: price.add(Money(1, "EGP"))

    assert mixed.value.code is Code.CONFLICT and mixed.value.reason == "number.currency"

    for bad in (lambda: Money(1, "us"), lambda: Money(1, "usd"), lambda: Money(1, "USD").split(0), lambda: Money(1, "USD").allocate([])):

        with pytest.raises(Fault): bad()

    with pytest.raises(Fault): number.tax(price, -1)

    strays: tuple[tuple[Any, Any, str], ...] = (
        (1, "ÀÉÎ", "currency"), (1, "ΑΒΓ", "currency"), (1, "US1", "currency"), (1, "USDT", "currency"), (1, "", "currency"),
        (1, None, "currency"), (1, 840, "currency"), (1, b"USD", "currency"), (1, ["USD"], "currency"), (1, "US\n", "currency"),
        (1.5, "USD", "minor"), (True, "USD", "minor"), ("1", "USD", "minor"), (None, "USD", "minor"), (Decimal(1), "USD", "minor"),
    )

    for minor, code, reason in strays:

        with pytest.raises(Fault) as stray: Money(minor, code)

        assert stray.value.code is Code.BAD_REQUEST and stray.value.reason == f"number.{reason}"

    builders: tuple[Callable[[Any], Money], ...] = (lambda held: number.money("1", held), lambda held: number.minor(1, held))

    for word in ("\ufb03", "\u017far", "\u01c6", "u\u017fd", None, 840, b"usd", ["usd"]):

        for build in builders:

            with pytest.raises(Fault) as odd: build(word)

            assert odd.value.code is Code.BAD_REQUEST and odd.value.reason == "number.currency"

    assert number.money("1", "kwd") == Money(1000, "KWD") and number.minor(-(10 ** 40), "eGp").minor == -(10 ** 40)

def test_money_reads_and_speaks () -> None:

    assert number.parse_money("12.50 EGP") == Money(1250, "EGP") and number.parse_money("EGP 12.50") == Money(1250, "EGP")
    assert number.parse_money("$1,234.50") == Money(123450, "USD") and number.parse_money("€ 10") == Money(1000, "EUR")
    assert number.parse_money(string.eastern("12.5") + " ج.م") == Money(1250, "EGP") and number.parse_money("-7 usd") == Money(-700, "USD")
    assert number.parse_money("250 ر.س") == Money(25000, "SAR") and number.parse_money("99", default="EGP") == Money(9900, "EGP")
    assert number.parse_money("1.250 KWD") == Money(1250, "KWD") and number.parse_money("500", "JPY") == Money(500, "JPY")

    for bad in ("", "abc", "12.50", "12.50 XXXX", "12 ج.م EGP"):

        with pytest.raises(Fault) as caught: number.parse_money(bad)

        assert caught.value.reason == "number.money"

    assert number.currency(Money(123450, "USD")) == "$1,234.50" and number.currency(Money(-1250, "EGP")) == "-12.50 EGP"
    assert number.currency(Money(1250, "EGP"), "ar") == "12.50 ج.م" and number.currency(Money(1250, "USD"), "ar") == "12.50 USD"
    assert number.currency(Money(1250, "USD"), symbol=False) == "12.50 USD" and number.currency(Money(1500, "KWD")) == "1.500 KWD"
    assert number.currency(Money(1250, "EGP"), "ar", symbol=False) == "12.50 EGP"
    assert number.spell(0) == "zero" and number.spell(21) == "twenty-one" and number.spell(105) == "one hundred five"
    assert number.spell(1250) == "one thousand two hundred fifty" and number.spell(1_000_000) == "one million"
    assert number.spell("12.5") == "twelve point five" and number.spell(-3) == "minus three"
    assert number.spell(21, "ar") == "واحد وعشرون" and number.spell(0, "ar") == "صفر" and number.spell(12, "ar") == "اثنا عشر"
    assert number.spell(1250, "ar") == "ألف ومائتان وخمسون" and number.spell(3000, "ar") == "ثلاثة آلاف"
    assert number.spell(2_000_000, "ar") == "مليونان" and number.spell(15000, "ar") == "خمسة عشر ألف"
    assert number.spell(200, "ar") == "مائتان" and number.spell("2.5", "ar") == "اثنان فاصلة خمسة" and number.spell(-1, "ar") == "سالب واحد"
    assert number.spell(Money(1250, "EGP").major()) == "twelve point five" and number.spell(Money(100, "USD").major(), "ar") == "واحد"

def test_the_laravel_lap_of_number_verbs () -> None:

    assert number.pairs(25, 10) == [(1, 10), (11, 20), (21, 25)] and number.pairs(25, 10, 0) == [(0, 10), (10, 20), (20, 25)]
    assert number.spell_ordinal(1) == "first" and number.spell_ordinal(22) == "twenty-second" and number.spell_ordinal(30) == "thirtieth"
    assert number.spell_ordinal(112) == "one hundred twelfth" and number.spell_ordinal(9) == "ninth"
    assert str(number.trim("12.30")) == "12.3" and str(number.trim(100)) == "100" and str(number.trim("1.0")) == "1"
    assert number.divide(10, 4) == Decimal("2.5") and number.divide(1, 0) == 0 and number.divide(1, 0, Decimal(9)) == 9
    assert number.divide(1, 3, places=2) == Decimal("0.33")

    with pytest.raises(Fault): number.pairs(5, 0)

def test_compact_places () -> None:

    assert number.compact(489939, 0) == "490K" and number.compact(1230000, 2) == "1.23M" and number.compact(1000) == "1K"
    assert number.compact(1500) == "1.5K" and number.compact(999, 0) == "999" and number.compact(10000, 0) == "10K"

def test_hostile_numbers_are_refused () -> None:

    assert number.decimal("1e27") == Decimal(10) ** 27 and number.decimal("1e-27") == Decimal(1).scaleb(-27)
    assert number.decimal("0e-400") == 0 and number.decimal("0." + "0" * 400) == 0 and number.decimal(10 ** 27) == Decimal(10) ** 27
    assert number.money("1e27", "KWD") == Money(10 ** 30, "KWD") and number.format("1e27", 6).endswith(".000000")
    assert number.spell(10 ** 18) == "one quintillion" and number.spell(10 ** 18, "ar") == "كوينتيليون"
    assert number.spell("1.5e-7") == "zero point zero zero zero zero zero zero one five"

    assert number.decimal(5e-324) > 0 and number.format(1e-38) == "0.00" and number.decimal("1e-400") > 0
    assert number.divide(3, "1e-400") == Decimal(3).scaleb(400) and number.spell(1e-9) == "zero point " + "zero " * 8 + "one"

    wide = ("1e28", "-1e28", "1e-401", "1e999999", "-1e999999", "1e-999999", "9" * 400, 10 ** 28, 10 ** 5000, Decimal("1E+999999"))

    for value in wide:

        for reader in READERS:

            with pytest.raises(Fault) as ranged: reader(value)

            assert ranged.value.reason == "number.range" and ranged.value.code is Code.BAD_REQUEST

    wild: tuple[object, ...] = (
        "", " ", "abc", "--1", "1e", "0x10", "\x00", "nan", "inf", "sNaN", None, [], b"1", True, Decimal("NaN"), Decimal("Infinity"),
    )

    for text in wild:

        for reader in (*READERS, lambda held: number.divide(held, 3), lambda held: number.divide(3, held)):

            with pytest.raises(Fault) as unread: reader(text)

            assert unread.value.reason == "number.decimal"

    beyonds: tuple[Callable[[], object], ...] = (
        lambda: number.format("1e27", 7), lambda: number.spell(10 ** 21), lambda: number.spell(10 ** 21, "ar"),
        lambda: number.spell_ordinal(10 ** 21), lambda: number.tax(Money(10 ** 40, "EGP"), 1), lambda: number.compact(10 ** 400),
        lambda: number.compact(float("inf")), lambda: number.compact(float("nan")), lambda: number.bytes(10 ** 400),
        lambda: number.percent(Decimal(10) ** 27, Decimal(1).scaleb(-27)),
    )

    for breaker in beyonds:

        with pytest.raises(Fault) as beyond: breaker()

        assert beyond.value.reason == "number.range"

    lost: tuple[Callable[[], object], ...] = (
        lambda: number.percent(Decimal("NaN"), 3), lambda: number.percent(3, Decimal("Infinity")), lambda: number.change(Decimal("NaN"), 3),
        lambda: number.quantize(Decimal("NaN"), 2), lambda: number.round_minor(Decimal("Infinity")),
    )

    for loser in lost:

        with pytest.raises(Fault) as unknown: loser()

        assert unknown.value.reason == "number.decimal"

    with pytest.raises(Fault) as roman: number.roman(10 ** 5000)

    assert roman.value.reason == "number.roman" and roman.value.errors == { "value": ["int"] }

    price = Money(1000, "USD")

    assert price.percent("12.5") == Money(125, "USD") and price.multiply(" 2 ") == Money(2000, "USD")
    assert price.percent(Decimal("2.5")) == Money(25, "USD") and price.multiply(3) == Money(3000, "USD")

    factors: tuple[Decimal | int | str, ...] = ("", "abc", "nan", "inf", "1e999999", Decimal("NaN"), Decimal("Infinity"), 10 ** 5000)

    for factor in factors:

        for scaler in (price.multiply, price.percent, lambda held: number.discount(price, held)):

            with pytest.raises(Fault) as refused: scaler(factor)

            assert refused.value.reason == "number.factor"

def test_laravel_number_examples_behave_the_same () -> None:

    assert number.compact(1000, 0) == "1K" and number.compact(489939, 0) == "490K" and number.compact(1230000, 2) == "1.23M"
    assert number.clamp(105, 10, 100) == 100 and number.clamp(5, 10, 100) == 10 and number.clamp(10, 10, 100) == 10
    assert number.currency(number.money("1000", "USD")) == "$1,000.00"
    assert number.bytes(1024) == "1 KiB" and number.bytes(1024 * 1024) == "1 MiB"
    assert number.format(100000, 0) == "100,000" and number.format(100000, 2) == "100,000.00"
    assert number.ordinal(1) == "1st" and number.ordinal(2) == "2nd" and number.ordinal(21) == "21st" and number.ordinal(12) == "12th"
    assert number.pairs(25, 10) == [(1, 10), (11, 20), (21, 25)] and number.pairs(25, 10, 0) == [(0, 10), (10, 20), (20, 25)]
    assert number.percent(10, 100) == Decimal("10.00")
    assert number.spell(102) == "one hundred two" and number.spell(88) == "eighty-eight"
    assert number.spell_ordinal(1) == "first" and number.spell_ordinal(2) == "second" and number.spell_ordinal(21) == "twenty-first"
    assert number.trim("12.30") == Decimal("12.3") and number.trim(12) == Decimal(12)

def test_every_supported_roman_number_round_trips_and_junk_is_rejected () -> None:

    for value in range(1, 4000):

        assert number.from_roman("  " + number.roman(value).lower() + "  ") == value

    for raw in ("", "IIII", "IC", "VX", "MMMM", "M" * 20000, "X" * 20000 + "!"):

        with pytest.raises(Fault) as refused: number.from_roman(raw)

        assert refused.value.reason == "number.roman"

@pytest.mark.parametrize("precision", [3, 7, 28, 50])
@pytest.mark.parametrize("dirty", [False, True])
def test_arithmetic_is_independent_of_the_callers_decimal_context ( precision: int, dirty: bool ) -> None:

    with localcontext() as ctx:

        ctx.prec = precision
        ctx.rounding = ROUND_DOWN
        ctx.Emax = 4
        ctx.Emin = -4
        ctx.clamp = 1

        for signal in ctx.traps: ctx.traps[signal] = True

        ctx.clear_flags()

        if dirty:

            with pytest.raises(InvalidOperation): Decimal("invalid")

        flags = dict(ctx.flags)
        assert number.money("1234.56", "USD").minor == 123456
        assert Money(123456, "USD").major() == Decimal("1234.56")
        assert Money(123456, "USD").text() == "1234.56 USD"
        assert number.currency(Money(123456, "USD")) == "$1,234.56"
        assert number.tax(Money(123456, "USD"), 1400).minor == 17284
        assert Money(1999, "USD").multiply("1.5").minor == 2998
        assert number.quantize(Decimal("2.345"), 2) == Decimal("2.35")
        assert number.percent(1, 3) == Decimal("33.33")
        assert number.change(100, 125) == Decimal("25.00")
        assert number.divide(1, 3, places=2) == Decimal("0.33")
        assert str(number.divide(1, 3)) == "0." + "3" * 34
        assert number.round_to("2.26", "0.05") == Decimal("2.25")
        assert number.trim("1234.567800") == Decimal("1234.5678")
        assert number.spell("1234.56") == "one thousand two hundred thirty-four point five six"
        assert number.format("1234.56") == "1,234.56"

        with pytest.raises(Fault): number.decimal("invalid")

        assert ctx.prec == precision and ctx.rounding == ROUND_DOWN and dict(ctx.flags) == flags
        assert ctx.Emax == 4 and ctx.Emin == -4 and ctx.clamp == 1 and all(ctx.traps.values())

def test_money_rounds_once_at_the_final_minor_unit () -> None:

    below = "0.004" + "9" * 80
    above = "0.005" + "0" * 79 + "1"

    assert number.money(below, "USD").minor == 0
    assert number.money(above, "USD").minor == 1
    assert number.money("-" + below, "USD").minor == 0
    assert number.money("-" + above, "USD").minor == -1
    assert Money(1, "USD").multiply("0.5" + "0" * 79 + "1").minor == 1
    assert Money(1, "USD").multiply("0.5").minor == 0
    assert Money(3, "USD").multiply("0.5").minor == 2
    assert Money(-3, "USD").multiply("0.5").minor == -2
    assert number.divide("0." + "4" + "9" * 80, 1, places=0) == 0
    assert number.round_to("0." + "4" + "9" * 80, 1) == 0
    assert number.percent("0.004" + "9" * 80, 1, places=0) == 0

def test_large_minor_units_have_exact_text_and_major_values () -> None:

    minor = 10 ** 60 + 123
    held = Money(minor, "USD")

    assert held.major() == Decimal("1" + "0" * 57 + "1.23")
    assert held.text() == "1" + "0" * 57 + "1.23 USD"
    assert number.currency(held, symbol=False).replace(",", "") == held.text()

@pytest.mark.parametrize("compare", [operator.lt, operator.le, operator.gt, operator.ge])
def test_money_order_requires_matching_currencies ( compare: Callable[[Any, Any], bool] ) -> None:

    with pytest.raises(Fault) as mixed: compare(Money(100, "USD"), Money(200, "EUR"))

    assert mixed.value.reason == "number.currency" and mixed.value.code is Code.CONFLICT
    assert compare(Money(1, "USD"), Money(2, "USD")) == compare(1, 2)
    assert Money(1, "USD") != Money(1, "EUR")
    assert len({Money(1, "USD"), Money(1, "USD"), Money(1, "EUR")}) == 2

def test_money_rejects_wrong_types_without_silent_numeric_coercion () -> None:

    held = Money(7, "USD")
    bad: tuple[Any, ...] = (True, False, 1.5, "2", None)

    for parts in bad:

        with pytest.raises(Fault) as caught: held.split(parts)

        assert caught.value.reason == "number.parts"

    for ratios in (None, 3, [True, 2], [1.5, 2], [1, "2"], [1, -1], [0, 0]):

        with pytest.raises(Fault) as caught: held.allocate(cast("Any", ratios))

        assert caught.value.reason == "number.ratios"

    for factor in (True, False, 1.5):

        with pytest.raises(Fault): held.multiply(cast("Any", factor))

    for bps in bad:

        with pytest.raises(Fault) as caught: number.tax(held, bps)

        assert caught.value.reason == "number.bps"

def test_allocations_preserve_units_sign_and_zero_weights () -> None:

    for minor in (-101, -5, -1, 0, 1, 5, 101):

        held = Money(minor, "USD")
        shares = held.allocate([0, 1, 2, 0, 3])
        assert sum(item.minor for item in shares) == minor
        assert shares[0].minor == shares[3].minor == 0
        assert held.allocate([1, 2]) == [part.negate() for part in held.negate().allocate([1, 2])]
        assert sum(item.minor for item in held.split(7)) == minor

def test_total_consumes_an_iterable_once_and_checks_all_currencies () -> None:

    items = (Money(value, "USD") for value in range(100))
    assert number.total(items) == Money(4950, "USD")
    assert list(items) == []

    with pytest.raises(Fault) as empty: number.total(iter(()))

    assert empty.value.reason == "number.empty"

    with pytest.raises(Fault) as mixed: number.total(iter((Money(1, "USD"), Money(2, "EUR"))))

    assert mixed.value.reason == "number.currency"

    with pytest.raises(Fault): number.total(cast("Any", [Money(1, "USD"), None]))

def test_work_and_rendering_limits_are_checked_before_allocation () -> None:

    calls: tuple[Callable[[], object], ...] = (
        lambda: Money(1, "USD").split(100_001),
        lambda: Money(1, "USD").allocate(range(100_001)),
        lambda: number.pad(1, 100_001),
        lambda: number.format(1, 401),
        lambda: number.compact(1, 401),
        lambda: number.pairs(100_001, 1),
        lambda: number.quantize(Decimal(1), 401),
        lambda: number.decimal("0." + "0" * 4096),
        lambda: number.decimal(Decimal("0e-999999")),
        lambda: number.percent("invalid", 0),
        lambda: number.divide("invalid", 0),
    )

    for call in calls:

        with pytest.raises(Fault): call()

def test_currency_minor_units_include_zero_and_four_decimal_codes () -> None:

    for code in ("BIF", "DJF", "GNF", "KMF", "PYG", "RWF", "UYI", "VUV", "XAF", "XOF", "XPF"):

        assert number.money("1.5", code) == Money(2, code)
        assert Money(12, code).major() == Decimal(12)

    for code in ("CLF", "UYW"):

        assert number.money("1.23456", code) == Money(12346, code)
        assert Money(12346, code).text() == f"1.2346 {code}"

def test_number_formatting_preserves_custom_separators_and_precision () -> None:

    assert number.format("1234.56", group=".", point=",") == "1.234,56"
    assert number.format("1234.56", group="", point=".") == "1234.56"
    assert number.format("1234.56", group="\0", point="|\0") == "1\0" + "234|\0" + "56"
    assert number.compact(1_234_500_000_000_000, 3) == "1.234Q"
    assert number.compact(1_000_000_000_000_000, 0) == "1Q"
    assert number.bytes(-1024) == "-1 KiB"
    assert number.ordinal(-1) == "-1st"
    assert number.ordinal(-12) == "-12th"

def test_huge_minor_conversion_does_not_depend_on_the_integer_text_limit () -> None:

    held = Money(10 ** 5000, "USD")

    with localcontext() as ctx:

        ctx.prec = 3
        assert held.major() == Decimal("1e4998")
        assert held.text().endswith(".00 USD")

def test_small_step_rounding_preserves_the_exact_step () -> None:

    step = Decimal("0.123456789012345678901234567890123456789")
    result = number.round_to(1, step)

    with localcontext() as ctx:

        ctx.prec = 100
        assert result == step * 8

def test_long_decimal_trim_does_not_round_significant_digits () -> None:

    raw = "1.123456789012345678901234567890123456789000"

    assert number.trim(raw) == Decimal(raw)

def test_numeric_predicates_do_not_turn_nan_into_valid_answers () -> None:

    for invalid in (float("nan"), float("inf"), float("-inf")):

        with pytest.raises(Fault): number.sign(invalid)
        with pytest.raises(Fault): number.clamp(invalid, 0, 1)
        with pytest.raises(Fault): number.between(0, invalid, 1)
        with pytest.raises(Fault): number.clamp(0, 0, invalid)

    with pytest.raises(Fault): number.sign(Decimal("sNaN"))
    with pytest.raises(Fault): number.clamp(0, 2, 1)

    assert number.change(-100, -75) == Decimal("25.00")
    assert number.change(-100, -125) == Decimal("-25.00")
    assert number.clamp(2**53 + 1, 0, 2**53 + 2) == 2**53 + 1

def test_integer_renderers_report_typed_errors () -> None:

    with pytest.raises(Fault): number.pad(10**5000, 0)
    with pytest.raises(Fault): number.ordinal(10**5000)
    with pytest.raises(Fault): number.pad(value=True, width=3)
    with pytest.raises(Fault): number.spell_ordinal(cast("Any", 1.5))

def test_exchange_rounds_once_in_destination_minor_units () -> None:

    assert number.exchange(number.money("100", "USD"), "JPY", "150").dump() == {
        "minor": 15000, "currency": "JPY",
    }
    assert number.exchange(number.minor(1, "JPY"), "KWD", "0.1235").minor == 124
    assert number.exchange(number.minor(-1, "JPY"), "KWD", "0.1235").minor == -124
    assert number.exchange(number.money("1", "USD"), "EUR", "0.005").minor == 0
    assert number.exchange(number.money("3", "USD"), "EUR", "0.005").minor == 2

def test_exchange_isolated_from_decimal_context_and_refuses_ambiguous_rates () -> None:

    with localcontext() as context:
        context.prec = 2
        context.clear_flags()
        assert number.exchange(number.money("123.45", "USD"), "EUR", "1.2345").minor == 15240
        assert not any(context.flags.values())
    rates: list[Any] = ["0", "-1", "NaN", "Infinity", 1.5, True]

    for rate in rates:
        with pytest.raises(Fault): number.exchange(number.money("1", "USD"), "EUR", rate)

@pytest.mark.parametrize("currency", ["USD", "JPY", "KWD", "CLF"])
@pytest.mark.parametrize("minor", [0, 1, -1, 10, -100, 123456789012345678901234567890])
def test_money_text_matches_exact_decimal_representation ( currency: str, minor: int ) -> None:

    money = Money(minor, currency)
    expected = f"{money.major():.{money.digits()}f} {currency}"
    with localcontext() as ctx:
        ctx.prec = 1
        for signal in ctx.traps: ctx.traps[signal] = True
        flags = dict(ctx.flags)
        assert money.text() == expected
        assert dict(ctx.flags) == flags

def test_money_text_keeps_large_integer_fallback () -> None:

    money = Money(10 ** 5000 + 3, "KWD")
    assert money.text() == f"{money.major():.3f} KWD"

def test_exact_decimal_preserves_wide_values_without_widening_fixed_decimal () -> None:

    value = 10 ** 80 + 1

    assert number.exact(value) == Decimal(value)
    assert number.exact(Decimal("1e-800")) == Decimal("1e-800")

    with pytest.raises(Fault): number.decimal(value)
    with pytest.raises(Fault): number.exact("1e999999999")
    for invalid in (True, "nan"):

        with pytest.raises(Fault): number.exact(invalid)
