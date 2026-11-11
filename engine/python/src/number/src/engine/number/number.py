from decimal import Decimal, DecimalException, ROUND_HALF_EVEN, ROUND_HALF_UP, localcontext
from typing import cast

from engine.error import Code, Fault
from engine.string import string
from .arch import (
    AMOUNT, AR_HUNDREDS, AR_ONES, AR_SCALES, AR_TENS, ARABIC, CODES, CURRENCY, DIGITS, FEW, FLOOR, HUNDRED, KIBI,
    Locale, ONES, ORDINALS, PAIR, PRECISION, REACH, ROMAN, ROMAN_MAX, SCALES, SPELLED, SYMBOLS, TEEN, TEENS, TENS,
    THOUSAND,
)
from .money import Money
import math

class Number:

    def decimal ( self, text: object, places: int | None = None ) -> Decimal:

        if isinstance(text, bool) or (isinstance(text, float) and math.isnan(text)):

            raise self._refuse_("decimal", text)

        try:

            if isinstance(text, (Decimal, int)): value = Decimal(text)
            else: value = Decimal(str(text).strip().replace("_", "").replace(",", ""))

        except (DecimalException, ValueError) as error: raise self._refuse_("decimal", text) from error

        if not value.is_finite(): raise self._refuse_("decimal", text)
        if value and not FLOOR <= value.adjusted() <= REACH: raise self._refuse_("range", text)

        return self.quantize(value, places) if places is not None else value

    def quantize ( self, value: Decimal, places: int, banker: bool = False ) -> Decimal:

        if not value.is_finite(): raise self._refuse_("decimal", value)

        try:

            with localcontext() as ctx:

                ctx.prec = PRECISION

                return value.quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_EVEN if banker else ROUND_HALF_UP)

        except DecimalException as error: raise self._refuse_("range", value) from error

    def round_minor ( self, value: Decimal ) -> int:

        return int(self.quantize(value, 0, banker=True))

    def round_to ( self, value: object, step: object ) -> Decimal:

        unit = self.decimal(step)

        if unit <= 0: raise self._refuse_("step", step)

        return self.quantize(self.decimal(value) / unit, 0) * unit

    def money ( self, amount: object, currency: str ) -> Money:

        code   = self._code_(currency)
        digits = DIGITS.get(code, 2)

        return Money(int(self.quantize(self.decimal(amount).scaleb(digits), 0)), code)

    def minor ( self, minor: int, currency: str ) -> Money:

        return Money(minor, self._code_(currency))

    def parse_money ( self, text: object, default: str | None = None ) -> Money:

        raw   = string.digits(str(text)).strip()
        found = AMOUNT.search(raw)

        if found is None: raise self._refuse_("money", text)

        unit = f"{raw[:found.start()]} {raw[found.end():]}".strip()
        code = CODES.get(unit) or (unit.upper() if len(unit) == CURRENCY and unit.isalpha() else None) or default

        if code is None or (unit and unit.upper() != code and unit not in CODES): raise self._refuse_("money", text)

        return self.money(found.group(0), code)

    def currency ( self, money: Money, locale: Locale = "en", symbol: bool = True ) -> str:

        amount = self.format(money.major().copy_abs(), money.digits())
        sign   = "-" if money.negative() else ""

        if locale == "ar":

            unit = ARABIC.get(money.currency, money.currency) if symbol else money.currency

            return f"{sign}{amount} {unit}"

        mark = SYMBOLS.get(money.currency) if symbol else None

        return f"{sign}{mark}{amount}" if mark else f"{sign}{amount} {money.currency}"

    def tax ( self, money: Money, bps: int ) -> Money:

        if bps < 0: raise self._refuse_("bps", bps)

        return Money(self.round_minor(Decimal(money.minor) * bps / 10000), money.currency)

    def discount ( self, money: Money, percent: Decimal | int | str ) -> Money:

        return money.subtract(money.percent(percent))

    def spell ( self, value: object, locale: Locale = "en" ) -> str:

        return self._spell_(self.decimal(value), locale)

    def clamp ( self, value: float, low: float, high: float ) -> float:

        return max(low, min(high, value))

    def between ( self, value: float, low: float, high: float ) -> bool:

        return low <= value <= high

    def sign ( self, value: float | Decimal ) -> int:

        return (value > 0) - (value < 0)

    def percent ( self, part: object, whole: object, places: int = 2 ) -> Decimal:

        base = self.decimal(whole)

        if not base: return Decimal(0)

        return self.quantize(self.decimal(part) * 100 / base, places)

    def change ( self, old: object, new: object, places: int = 2 ) -> Decimal | None:

        before, after = self.decimal(old), self.decimal(new)

        if before == 0: return None

        return self.quantize((after - before) * 100 / abs(before), places)

    def format ( self, value: object, places: int = 2, group: str = ",", point: str = "." ) -> str:

        text = f"{self.decimal(value, places):,.{places}f}"

        return text.replace(",", "\x00").replace(".", point).replace("\x00", group)

    def pad ( self, value: int, width: int ) -> str:

        return str(value).zfill(width)

    def compact ( self, value: float, places: int = 1 ) -> str:

        size = self._real_(value)

        for unit in ("", "K", "M", "B", "T"):

            if abs(size) < THOUSAND:

                text = f"{size:.{places}f}"

                return (text.rstrip("0").rstrip(".") if places else text) + unit

            size /= THOUSAND

        return f"{size:.1f}Q"

    def bytes ( self, size: int ) -> str:

        value = self._real_(size)

        for unit in ("B", "KiB", "MiB", "GiB", "TiB"):

            if value < KIBI or unit == "TiB": return f"{value:.1f}".rstrip("0").rstrip(".") + f" {unit}"

            value /= KIBI

        return f"{value:.1f} TiB"

    def pairs ( self, total: int, size: int, offset: int = 1 ) -> list[tuple[int, int]]:

        if size < 1: raise self._refuse_("pairs", size)

        return [(lower + offset, min(lower + size, total)) for lower in range(0, total, size)]

    def spell_ordinal ( self, value: int ) -> str:

        spelled = self.spell(value)
        head, _, last = spelled.rpartition(" ") if " " in spelled else ("", "", spelled)
        stem, _, tail = last.rpartition("-") if "-" in last else ("", "", last)
        word = ORDINALS.get(tail) or (tail[:-1] + "ieth" if tail.endswith("y") else tail + "th")
        last = f"{stem}-{word}" if stem else word

        return f"{head} {last}".strip()

    def trim ( self, value: object ) -> Decimal:

        made = self.decimal(value)

        return self.quantize(made, 0) if made == made.to_integral_value() else made.normalize()

    def divide (
        self, dividend: object, divisor: object, default: Decimal | None = None, places: int | None = None,
    ) -> Decimal:

        base = self.decimal(divisor)

        if not base: return Decimal(0) if default is None else default

        made = self.decimal(dividend) / base

        return self.quantize(made, places) if places is not None else made

    def ordinal ( self, value: int ) -> str:

        suffix = "th" if TEENS[0] <= value % 100 <= TEENS[1] else { 1: "st", 2: "nd", 3: "rd" }.get(value % 10, "th")

        return f"{value}{suffix}"

    def roman ( self, value: int ) -> str:

        if not 1 <= value <= ROMAN_MAX: raise self._refuse_("roman", value)

        text = ""
        rest = value

        for amount, letters in ROMAN:

            count, rest = divmod(rest, amount)
            text += letters * count

        return text

    def from_roman ( self, text: str ) -> int:

        rest  = text.strip().upper()
        total = 0

        for amount, letters in ROMAN:

            while rest.startswith(letters):

                total += amount
                rest   = rest[len(letters):]

        if rest or not total or self.roman(total) != text.strip().upper(): raise self._refuse_("roman", text)

        return total

    def total ( self, items: list[Money] ) -> Money:

        if not items: raise self._refuse_("empty", items)

        first = items[0]

        for item in items[1:]: first = first.add(item)

        return first

    def _code_ ( self, currency: str ) -> str:

        plain = type(cast("object", currency)) is str and currency.isascii()

        if not plain: raise self._refuse_("currency", currency)

        return currency.upper()

    def _refuse_ ( self, reason: str, text: object ) -> Fault:

        try: shown = str(text)[:64]
        except ValueError: shown = type(text).__name__

        return Fault(Code.BAD_REQUEST, "Cannot read the number", f"number.{reason}", { "value": [shown] })

    def _real_ ( self, value: float ) -> float:

        try: size = float(value)
        except (OverflowError, TypeError, ValueError) as error: raise self._refuse_("range", value) from error

        if not math.isfinite(size): raise self._refuse_("range", value)

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
        whole    = int(abs(amount))

        if whole >= SPELLED: raise self._refuse_("range", value)

        fraction = f"{abs(amount):f}".partition(".")[2].rstrip("0")
        words    = self._arabic_(whole) if locale == "ar" else self._english_(whole)

        if fraction:

            digits = " ".join((AR_ONES if locale == "ar" else ONES)[int(digit)] for digit in fraction)
            words  = f"{words} فاصلة {digits}" if locale == "ar" else f"{words} point {digits}"

        if negative: return f"سالب {words}" if locale == "ar" else f"minus {words}"

        return words
