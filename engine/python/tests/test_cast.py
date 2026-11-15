from decimal import Decimal, localcontext
from typing import Any
from itertools import count
from engine.cast import cast
from engine.error import Fault
from engine.number import number
import pytest

@pytest.mark.parametrize(("value", "expected"), [("123", 123), ("١٢", 12), (12.0, 12), (Decimal("12.00"), 12), (-7, -7)])
def test_integer_is_exact ( value: object, expected: int ) -> None:

    assert cast.integer(value) == expected

@pytest.mark.parametrize("value", [True, None, "1.2", 1.2, float("inf"), float("nan"), Decimal("NaN"), "1__2", "9" * 5000], ids=["bool", "none", "fraction-text", "fraction", "inf", "nan", "decimal-nan", "separator", "long"])
def test_integer_rejects_lossy_or_malformed_values ( value: object ) -> None:

    with pytest.raises(Fault): cast.integer(value)

@pytest.mark.parametrize(("value", "expected"), [("false", False), ("0", False), ("yes", True), ("لا", False), (1, True)])
def test_boolean_has_explicit_meaning ( value: object, expected: bool ) -> None:

    assert cast.boolean(value) is expected

@pytest.mark.parametrize("value", ["unknown", None, 2, [], 1.0])
def test_boolean_does_not_use_python_truthiness ( value: object ) -> None:

    with pytest.raises(Fault): cast.boolean(value)

def test_numeric_limits_and_safe_error_payloads () -> None:

    assert cast.number("1.25") == 1.25
    assert cast.integer("5", 1, 10) == 5
    for value in ("secret-token", "1e999", float("nan"), True):
        with pytest.raises(Fault) as caught: cast.number(value)
        assert caught.value.errors is None
    with pytest.raises(Fault): cast.integer(5, 10, 1)
    with pytest.raises(Fault): cast.integer(11, high=10)

def test_text_bytes_and_container_conversions () -> None:

    assert cast.text("x") == "x"
    assert cast.text(memoryview(b"abc")) == "abc"
    assert cast.bytes("مرحبا").decode() == "مرحبا"
    assert cast.list(" 1, ,2 ", using=cast.integer) == [1, 2]
    assert cast.list((1, 2)) == [1, 2]
    assert cast.list(None) == []
    assert cast.dict('{"x": 1}') == {"x": 1}
    assert cast.dict(iter([("x", 1)])) == {"x": 1}
    invalid: Any = 10
    with pytest.raises(Fault): cast.bytes(invalid)
    with pytest.raises(Fault): cast.text(b"\xff")
    with pytest.raises(Fault): cast.dict([("x", 1), ("x", 2)])
    with pytest.raises(Fault): cast.dict([(1, "x")])
    with pytest.raises(Fault): cast.list(count(), limit=3)

def test_money_preserves_currency_and_minor_units_without_float_rounding () -> None:

    money = cast.money("12.345", "KWD")
    assert money.minor == 12345 and cast.major(money) == Decimal("12.345")
    assert cast.money(money) is money
    assert cast.money(money.dump()) == money
    assert cast.money(12345, "KWD", minor=True) == money
    assert cast.minor("12.345", "KWD") == 12345
    assert cast.money("USD 12.50").minor == 1250
    assert cast.text(number.money("1.25", "USD")) == "1.25 USD"
    with pytest.raises(Fault): cast.money(money, "USD")
    with pytest.raises(Fault): cast.money({"minor": True, "currency": "USD"})
    with localcontext() as context:
        context.prec = 2
        assert cast.decimal("123.456") == Decimal("123.456")

def test_auto_preserves_non_numeric_text () -> None:

    assert cast.auto("12") == 12
    assert cast.auto("1.25") == 1.25
    assert cast.auto("false") is False
    assert cast.auto("null") is None
    assert cast.auto("1e9999") == "1e9999"
    assert cast.auto("text") == "text"

def test_bounds_refuse_nonfinite_and_wrong_types () -> None:

    for bound in (float("nan"), float("inf"), True, "4"):
        bad: Any = bound
        with pytest.raises(Fault): cast.integer(1, low=bad)
        with pytest.raises(Fault): cast.number(1, high=bad)
    assert cast.integer(2**4095) == 2**4095
    with pytest.raises(Fault): cast.integer(2**4096)
    with pytest.raises(Fault): cast.integer(Decimal("1e999999"))
    with pytest.raises(Fault): cast.money(0.1, "USD")
    with pytest.raises(Fault): cast.money({"minor": 1, "currency": "USD"}, "EUR")
    assert cast.auto("not-a-number") == "not-a-number"

@pytest.mark.parametrize("value", [None, 1, [], {}])
def test_invalid_encoding_raises_typed_fault ( value: Any ) -> None:

    with pytest.raises(Fault): cast.bytes("x", value)
    with pytest.raises(Fault): cast.text(b"x", value)

def test_sequence_and_mapping_fast_paths_keep_ownership_and_limits () -> None:

    values = [1, 2]
    made = cast.list(values)
    assert made == values and made is not values
    assert cast.list(tuple(values), using=lambda item: item * 2) == [2, 4]
    seen: list[int] = []
    with pytest.raises(Fault): cast.list(values, using=seen.append, limit=1)
    assert seen == []
    fields = {"a": values}
    copy = cast.dict(fields)
    assert copy == fields and copy is not fields and copy["a"] is values
    with pytest.raises(Fault): cast.dict({1: "invalid"})
    with pytest.raises(Fault): cast.dict(fields, limit=0)
    with pytest.raises(Fault): cast.dict([("a", 1), ("a", 2)])

@pytest.mark.parametrize("flag", ["false", 1, None])
def test_money_minor_selector_is_explicit ( flag: Any ) -> None:

    with pytest.raises(Fault): cast.money("1", "USD", minor=flag)

def test_conversion_callbacks_use_a_snapshot_of_the_input () -> None:

    source = [1, 2]

    def append ( value: int ) -> int:

        source.append(value + 10)

        return value * 2

    assert cast.list(source, using=append, limit=2) == [2, 4]
    assert source == [1, 2, 11, 12]

def test_mapping_buffer_limit_counts_bytes_not_elements () -> None:

    raw = b"{}" + b" " * 100002
    viewed = memoryview(raw).cast("I")
    with pytest.raises(Fault): cast.dict(viewed)
