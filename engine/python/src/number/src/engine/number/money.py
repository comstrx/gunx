from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal, DecimalException, ROUND_HALF_EVEN, localcontext
from typing import cast

from engine.error import Code, Fault
from .arch import CURRENCY, DIGITS, PRECISION

@dataclass(frozen=True, slots=True, order=True)
class Money:

    minor    : int
    currency : str

    def __post_init__ ( self ) -> None:

        code  = cast("object", self.currency)
        sound = type(code) is str and len(code) == CURRENCY and code.isascii() and code.isalpha() and code.isupper()

        if type(cast("object", self.minor)) is not int: raise self._refuse_("minor", self.minor)
        if not sound: raise self._refuse_("currency", self.currency)

    def digits ( self ) -> int:

        return DIGITS.get(self.currency, 2)

    def major ( self ) -> Decimal:

        return Decimal(self.minor).scaleb(-self.digits())

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

        if parts < 1: raise self._refuse_("parts", parts)

        base, rest = divmod(self.minor, parts)

        return [Money(base + (1 if index < rest else 0), self.currency) for index in range(parts)]

    def allocate ( self, ratios: Sequence[int] ) -> list[Money]:

        total = sum(ratios)

        if not ratios or total <= 0 or any(ratio < 0 for ratio in ratios): raise self._refuse_("ratios", ratios)

        amount = abs(self.minor)
        shares = [amount * ratio // total for ratio in ratios]
        left   = amount - sum(shares)
        order  = sorted(range(len(ratios)), key=lambda index: (-(amount * ratios[index] % total), index))

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

        return f"{self.major():.{self.digits()}f} {self.currency}"

    def dump ( self ) -> dict[str, object]:

        return { "minor": self.minor, "currency": self.currency }

    def _same_ ( self, other: Money ) -> None:

        if other.currency != self.currency: raise Fault(Code.CONFLICT, "Currencies differ", "number.currency")

    def _scaled_ ( self, factor: Decimal | int | str, shift: int ) -> Money:

        try:

            with localcontext() as ctx:

                ctx.prec = PRECISION
                rate     = Decimal(factor) if isinstance(factor, (Decimal, int)) else Decimal(str(factor).strip())
                scaled   = Decimal(self.minor) * rate.scaleb(shift)
                minor    = int(scaled.quantize(Decimal(1), rounding=ROUND_HALF_EVEN))

        except (DecimalException, ValueError) as error: raise self._refuse_("factor", factor) from error

        return Money(minor, self.currency)

    def _refuse_ ( self, reason: str, text: object ) -> Fault:

        try: shown = str(text)[:64]
        except ValueError: shown = type(text).__name__

        return Fault(Code.BAD_REQUEST, "Cannot read the number", f"number.{reason}", { "value": [shown] })
