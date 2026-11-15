from .base import Base
from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from types import NotImplementedType
from typing import cast

from engine.error import Code, Fault
from .arch import CURRENCY, DIGITS, MAXIMUM, OUTPUT

@dataclass(frozen=True, slots=True)
class Money:

    minor    : int
    currency : str

    def __post_init__ ( self ) -> None:

        code  = cast("object", self.currency)
        sound = type(code) is str and len(code) == CURRENCY and code.isascii() and code.isalpha() and code.isupper()

        if type(cast("object", self.minor)) is not int: raise Base.refuse("minor", self.minor)
        if not sound: raise Base.refuse("currency", self.currency)

    def digits ( self ) -> int:

        return DIGITS.get(self.currency, 2)

    def major ( self ) -> Decimal:

        try: return Decimal(f"{self.minor}e-{self.digits()}")
        except ValueError: return Base.shifted(Decimal(self.minor), -self.digits())

    def add ( self, other: Money ) -> Money:

        self._same_(other)

        return Money(self.minor + other.minor, self.currency)

    def subtract ( self, other: Money ) -> Money:

        self._same_(other)

        return Money(self.minor - other.minor, self.currency)

    def multiply ( self, factor: Decimal | int | str ) -> Money:

        return self._scaled_(factor, 0)

    def percent ( self, rate: Decimal | int | str ) -> Money:

        return self._scaled_(rate, -2)

    def split ( self, parts: int ) -> list[Money]:

        Base.integer(parts, "parts", 1, OUTPUT)
        base, rest = divmod(self.minor, parts)

        return [Money(base + (index < rest), self.currency) for index in range(parts)]

    def allocate ( self, ratios: Sequence[int] ) -> list[Money]:

        if not isinstance(cast("object", ratios), Sequence) or not ratios or len(ratios) > OUTPUT:

            raise Base.refuse("ratios", ratios)

        if any(type(ratio) is not int or ratio < 0 for ratio in ratios): raise Base.refuse("ratios", ratios)

        total = sum(ratios)

        if not total: raise Base.refuse("ratios", ratios)

        amount = abs(self.minor)
        shares: list[int] = []
        remainders: list[int] = []

        for ratio in ratios:

            share, remainder = divmod(amount * ratio, total)
            shares.append(share)
            remainders.append(remainder)

        left = amount - sum(shares)

        if left:

            order = sorted(range(len(ratios)), key=remainders.__getitem__, reverse=True)

            for index in order[:left]: shares[index] += 1

        sign = -1 if self.minor < 0 else 1

        return [Money(sign * share, self.currency) for share in shares]

    def compare ( self, other: Money ) -> int:

        self._same_(other)

        return (self.minor > other.minor) - (self.minor < other.minor)

    def absolute ( self ) -> Money:

        return Money(abs(self.minor), self.currency)

    def negate ( self ) -> Money:

        return Money(-self.minor, self.currency)

    def negative ( self ) -> bool:

        return self.minor < 0

    def zero ( self ) -> bool:

        return self.minor == 0

    def text ( self ) -> str:

        digits = self.digits()
        whole, tail = divmod(abs(self.minor), 10 ** digits)

        try:

            amount = f"{whole}.{tail:0{digits}d}" if digits else str(whole)

        except ValueError: return f"{self.major():.{digits}f} {self.currency}"

        return f"{'-' if self.minor < 0 else ''}{amount} {self.currency}"

    def dump ( self ) -> dict[str, object]:

        return { "minor": self.minor, "currency": self.currency }

    def _same_ ( self, other: Money ) -> None:

        if not isinstance(other, Money): raise Base.refuse("money", other)
        if other.currency != self.currency: raise Fault(Code.CONFLICT, "Currencies differ", "number.currency")

    def _scaled_ ( self, factor: Decimal | int | str, shift: int ) -> Money:

        if isinstance(factor, (bool, float)): raise Base.refuse("factor", factor)

        try: numerator, denominator = Base.read(factor).as_integer_ratio()
        except Fault as error: raise Base.refuse("factor", factor) from error

        minor = Base.rounded(self.minor * numerator, denominator * 10 ** -shift, banker=True)

        if abs(minor) >= MAXIMUM: raise Base.refuse("factor", factor)

        return Money(minor, self.currency)

    def __lt__ ( self, other: object ) -> bool | NotImplementedType:

        if not isinstance(other, Money): return NotImplemented

        self._same_(other)

        return self.minor < other.minor

    def __le__ ( self, other: object ) -> bool | NotImplementedType:

        if not isinstance(other, Money): return NotImplemented

        self._same_(other)

        return self.minor <= other.minor

    def __gt__ ( self, other: object ) -> bool | NotImplementedType:

        if not isinstance(other, Money): return NotImplemented

        self._same_(other)

        return self.minor > other.minor

    def __ge__ ( self, other: object ) -> bool | NotImplementedType:

        if not isinstance(other, Money): return NotImplemented

        self._same_(other)

        return self.minor >= other.minor
