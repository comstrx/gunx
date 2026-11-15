from .base import Base
from collections.abc import Iterable
from decimal import Decimal, DecimalException, ROUND_HALF_EVEN, ROUND_HALF_UP
from typing import cast

from engine.error import Code, Fault
from engine.string import string
from .arch import (
    AMOUNT, AR_HUNDREDS, AR_ONES, AR_SCALES, AR_TENS, ARABIC, CODES, CURRENCY, DIGITS, FEW, FLOOR, HUNDRED, KIBI,
    Locale, ONES, ORDINALS, PAIR, REACH, ROMAN, ROMAN_MAX, SCALES, SPELLED, SYMBOLS, TEEN, TEENS, TENS, THOUSAND, BPS,
    CONTEXT, INPUT, MAXIMUM, OUTPUT, PLACES,
)
from .money import Money
import math

class Number:

    def exact ( self, value: object ) -> Decimal:

        return Base.read(value)

    def decimal ( self, text: object, places: int | None = None ) -> Decimal:

        value = Base.read(text)

        if value and not FLOOR <= value.adjusted() <= REACH: raise Base.refuse("range", text)

        return self.quantize(value, places) if places is not None else value

    def quantize ( self, value: Decimal, places: int, banker: bool = False ) -> Decimal:

        if not value.is_finite(): raise Base.refuse("decimal", value)

        Base.integer(places, "places", -PLACES, PLACES)

        try:

            return value.quantize(
                Decimal((0, (1,), -places)),
                rounding=ROUND_HALF_EVEN if banker else ROUND_HALF_UP, context=CONTEXT.copy(),
            )

        except DecimalException as error: raise Base.refuse("range", value) from error

    def round_minor ( self, value: Decimal ) -> int:

        return int(self.quantize(value, 0, banker=True))

    def round_to ( self, value: object, step: object ) -> Decimal:

        unit = self.decimal(step)

        if unit <= 0: raise Base.refuse("step", step)

        left, bottom = self.decimal(value).as_integer_ratio()
        right, base = unit.as_integer_ratio()
        count = Base.rounded(left * base, bottom * right)

        context = CONTEXT.copy()
        context.prec = INPUT * 2 + PLACES

        try: return context.multiply(Decimal(count), unit)
        except DecimalException as error: raise Base.refuse("range", value) from error

    def money ( self, amount: object, currency: str ) -> Money:

        code = self._code_(currency)
        numerator, denominator = self.decimal(amount).as_integer_ratio()

        return Money(Base.rounded(numerator * 10 ** DIGITS.get(code, 2), denominator), code)

    def minor ( self, minor: int, currency: str ) -> Money:

        return Money(minor, self._code_(currency))

    def exchange ( self, money: Money, currency: str, rate: Decimal | int | str ) -> Money:

        if not isinstance(money, Money): raise Base.refuse("money", money)
        if isinstance(rate, (bool, float)): raise Base.refuse("rate", rate)

        code = self._code_(currency)
        value = self.decimal(rate)

        if value <= 0: raise Base.refuse("rate", rate)

        numerator, denominator = value.as_integer_ratio()
        minor = Base.rounded(
            money.minor * numerator * 10 ** DIGITS.get(code, 2),
            denominator * 10 ** money.digits(), banker=True,
        )

        if abs(minor) >= MAXIMUM: raise Base.refuse("range", minor)

        return Money(minor, code)

    def parse_money ( self, text: object, default: str | None = None ) -> Money:

        raw = str(text)

        if len(raw) > INPUT: raise Base.refuse("money", text)

        raw   = string.digits(raw).strip()
        found = AMOUNT.search(raw)

        if found is None: raise Base.refuse("money", text)

        unit = f"{raw[:found.start()]} {raw[found.end():]}".strip()
        code = CODES.get(unit) or (unit.upper() if len(unit) == CURRENCY and unit.isalpha() else None) or default

        if code is None or (unit and unit.upper() != code and unit not in CODES): raise Base.refuse("money", text)

        return self.money(found.group(0), code)

    def currency ( self, money: Money, locale: Locale = "en", symbol: bool = True ) -> str:

        amount = f"{money.major().copy_abs():,.{money.digits()}f}"
        sign   = "-" if money.negative() else ""

        if locale == "ar":

            unit = ARABIC.get(money.currency, money.currency) if symbol else money.currency

            return f"{sign}{amount} {unit}"

        mark = SYMBOLS.get(money.currency) if symbol else None

        return f"{sign}{mark}{amount}" if mark else f"{sign}{amount} {money.currency}"

    def tax ( self, money: Money, bps: int ) -> Money:

        if type(bps) is not int or bps < 0: raise Base.refuse("bps", bps)

        minor = Base.rounded(money.minor * bps, BPS, banker=True)

        if abs(minor) >= MAXIMUM: raise Base.refuse("range", minor)

        return Money(minor, money.currency)

    def discount ( self, money: Money, percent: Decimal | int | str ) -> Money:

        return money.subtract(money.percent(percent))

    def spell ( self, value: object, locale: Locale = "en" ) -> str:

        return self._spell_(self.decimal(value), locale)

    def clamp ( self, value: float, low: float, high: float ) -> float:

        self._bounds_(value, low, high)

        return max(low, min(high, value))

    def between ( self, value: float, low: float, high: float ) -> bool:

        self._bounds_(value, low, high)

        return low <= value <= high

    def sign ( self, value: float | Decimal ) -> int:

        if isinstance(value, Decimal):

            if not value.is_finite(): raise Base.refuse("range", value)

        else: self._real_(value)

        return (value > 0) - (value < 0)

    def percent ( self, part: object, whole: object, places: int = 2 ) -> Decimal:

        left = self.decimal(part)
        right = self.decimal(whole)
        Base.integer(places, "places", -PLACES, PLACES)

        if not right: return Decimal(0)

        numerator, bottom = left.as_integer_ratio()
        denominator, base = right.as_integer_ratio()

        return Base.fraction(numerator * base * HUNDRED, bottom * denominator, places)

    def change ( self, old: object, new: object, places: int = 2 ) -> Decimal | None:

        before, after = self.decimal(old), self.decimal(new)
        Base.integer(places, "places", -PLACES, PLACES)

        if not before: return None

        first, base = before.as_integer_ratio()
        last, bottom = after.as_integer_ratio()

        return Base.fraction((last * base - first * bottom) * HUNDRED, bottom * abs(first), places)

    def format ( self, value: object, places: int = 2, group: str = ",", point: str = "." ) -> str:

        Base.integer(places, "places", 0, PLACES)
        text = f"{self.decimal(value, places):,.{places}f}"

        if group == "," and point == ".": return text

        whole, dot, tail = text.partition(".")

        return whole.replace(",", group) + (point + tail if dot else "")

    def pad ( self, value: int, width: int ) -> str:

        Base.integer(width, "width", 0, OUTPUT)

        if type(value) is not int: raise Base.refuse("integer", value)

        try: return str(value).zfill(width)
        except ValueError as error: raise Base.refuse("range", value) from error

    def compact ( self, value: float, places: int = 1 ) -> str:

        Base.integer(places, "places", 0, PLACES)
        size = self._real_(value)

        for unit in ("", "K", "M", "B", "T"):

            if abs(size) < THOUSAND:

                text = f"{size:.{places}f}"

                return (text.rstrip("0").rstrip(".") if places else text) + unit

            size /= THOUSAND

        text = f"{size:.{places}f}"

        return (text.rstrip("0").rstrip(".") if places else text) + "Q"

    def bytes ( self, size: int ) -> str:

        value = self._real_(size)

        for unit in ("B", "KiB", "MiB", "GiB", "TiB"):

            if abs(value) < KIBI or unit == "TiB": return f"{value:.1f}".rstrip("0").rstrip(".") + f" {unit}"

            value /= KIBI

        return f"{value:.1f} TiB"

    def pairs ( self, total: int, size: int, offset: int = 1 ) -> list[tuple[int, int]]:

        if type(total) is not int or total < 0: raise Base.refuse("pairs", total)
        if type(size) is not int or size < 1: raise Base.refuse("pairs", size)
        if type(offset) is not int: raise Base.refuse("pairs", offset)
        if (total + size - 1) // size > OUTPUT: raise Base.refuse("pairs", total)

        return [(lower + offset, min(lower + size, total)) for lower in range(0, total, size)]

    def spell_ordinal ( self, value: int ) -> str:

        if type(value) is not int: raise Base.refuse("ordinal", value)

        spelled = self.spell(value)
        head, _, last = spelled.rpartition(" ") if " " in spelled else ("", "", spelled)
        stem, _, tail = last.rpartition("-") if "-" in last else ("", "", last)
        word = ORDINALS.get(tail) or (tail[:-1] + "ieth" if tail.endswith("y") else tail + "th")
        last = f"{stem}-{word}" if stem else word

        return f"{head} {last}".strip()

    def trim ( self, value: object ) -> Decimal:

        made = self.decimal(value)

        if made == made.to_integral_value(): return self.quantize(made, 0)

        context = CONTEXT.copy()
        context.prec = INPUT

        return made.normalize(context=context)

    def divide (
        self, dividend: object, divisor: object, default: Decimal | None = None, places: int | None = None,
    ) -> Decimal:

        value, base = self.decimal(dividend), self.decimal(divisor)

        if places is not None: Base.integer(places, "places", -PLACES, PLACES)
        if not base: return Decimal(0) if default is None else Base.read(default)
        if places is None: return CONTEXT.copy().divide(value, base)

        numerator, bottom = value.as_integer_ratio()
        denominator, scale = base.as_integer_ratio()

        return Base.fraction(numerator * scale, bottom * denominator, places)

    def ordinal ( self, value: int ) -> str:

        if type(value) is not int: raise Base.refuse("ordinal", value)

        magnitude = abs(value)
        suffix = (
            "th" if TEENS[0] <= magnitude % 100 <= TEENS[1]
            else { 1: "st", 2: "nd", 3: "rd" }.get(magnitude % 10, "th")
        )

        try: return f"{value}{suffix}"
        except ValueError as error: raise Base.refuse("range", value) from error

    def roman ( self, value: int ) -> str:

        if type(value) is not int or not 1 <= value <= ROMAN_MAX: raise Base.refuse("roman", value)

        text = ""
        rest = value

        for amount, letters in ROMAN:

            count, rest = divmod(rest, amount)
            text += letters * count

        return text

    def from_roman ( self, text: str ) -> int:

        if len(text) > INPUT: raise Base.refuse("roman", text)

        normalized = text.strip().upper()
        total, at = 0, 0

        for amount, letters in ROMAN:

            while normalized.startswith(letters, at):

                total += amount
                at += len(letters)

        if at != len(normalized) or not total or self.roman(total) != normalized:

            raise Base.refuse("roman", text)

        return total

    def total ( self, items: Iterable[Money] ) -> Money:

        rows = iter(items)
        first = next(rows, None)

        if first is None: raise Base.refuse("empty", items)
        if not isinstance(first, Money): raise Base.refuse("money", first)

        amount = first.minor
        currency = first.currency

        for item in rows:

            if not isinstance(item, Money): raise Base.refuse("money", item)
            if item.currency != currency: raise Fault(Code.CONFLICT, "Currencies differ", "number.currency")

            amount += item.minor

        return Money(amount, currency)

    def _code_ ( self, currency: str ) -> str:

        plain = (
            type(cast("object", currency)) is str and len(currency) == CURRENCY
            and currency.isascii() and currency.isalpha()
        )

        if not plain: raise Base.refuse("currency", currency)

        return currency.upper()

    def _bounds_ ( self, value: float, low: float, high: float ) -> None:

        self._real_(value)
        self._real_(low)
        self._real_(high)

        if low > high: raise Base.refuse("bounds", (low, high))

    def _real_ ( self, value: float ) -> float:

        if isinstance(value, bool): raise Base.refuse("range", value)

        try: size = float(value)
        except (OverflowError, TypeError, ValueError) as error: raise Base.refuse("range", value) from error

        if not math.isfinite(size): raise Base.refuse("range", value)

        return size

    def _english_small_ ( self, value: int ) -> str:

        if value < TEEN: return ONES[value]

        if value < HUNDRED:

            tens, ones = divmod(value, 10)

            return TENS[tens] + (f"-{ONES[ones]}" if ones else "")

        hundreds, rest = divmod(value, HUNDRED)

        return f"{ONES[hundreds]} hundred" + (f" {self._english_small_(rest)}" if rest else "")

    def _english_ ( self, value: int ) -> str:

        if value == 0: return ONES[0]

        parts: list[str] = []
        rest  = value
        scale = 0

        while rest:

            rest, group = divmod(rest, THOUSAND)

            if group: parts.insert(0, (self._english_small_(group) + (f" {SCALES[scale]}" if scale else "")).strip())

            scale += 1

        return " ".join(parts)

    def _arabic_small_ ( self, value: int ) -> str:

        hundreds, rest = divmod(value, HUNDRED)
        parts: list[str] = []

        if hundreds: parts.append(AR_HUNDREDS[hundreds])

        if rest and rest < TEEN: parts.append(AR_ONES[rest])
        elif rest:

            tens, ones = divmod(rest, 10)

            parts.append(f"{AR_ONES[ones]} و{AR_TENS[tens]}" if ones else AR_TENS[tens])

        return " و".join(parts)

    def _arabic_group_ ( self, group: int, scale: int ) -> str:

        if scale == 0: return self._arabic_small_(group)

        one, two, many = AR_SCALES[scale - 1]

        if group == 1: return one
        if group == PAIR: return two
        if group <= FEW: return f"{self._arabic_small_(group)} {many}"

        return f"{self._arabic_small_(group)} {one}"

    def _arabic_ ( self, value: int ) -> str:

        if value == 0: return AR_ONES[0]

        parts: list[str] = []
        rest  = value
        scale = 0

        while rest:

            rest, group = divmod(rest, THOUSAND)

            if group: parts.insert(0, self._arabic_group_(group, scale))

            scale += 1

        return " و".join(parts)

    def _spell_ ( self, value: Decimal | int, locale: str = "en" ) -> str:

        amount   = Decimal(value)
        negative = amount < 0
        whole    = int(amount.copy_abs())

        if whole >= SPELLED: raise Base.refuse("range", value)

        fraction = f"{amount.copy_abs():f}".partition(".")[2].rstrip("0")
        words    = self._arabic_(whole) if locale == "ar" else self._english_(whole)

        if fraction:

            digits = " ".join((AR_ONES if locale == "ar" else ONES)[int(digit)] for digit in fraction)
            words  = f"{words} فاصلة {digits}" if locale == "ar" else f"{words} point {digits}"

        if negative: return f"سالب {words}" if locale == "ar" else f"minus {words}"

        return words
