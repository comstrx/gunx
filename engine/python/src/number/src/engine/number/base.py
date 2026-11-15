from decimal import Decimal, DecimalException
from engine.error import Code, Fault
from .arch import CONTEXT, INPUT, MAXIMUM, PLACES

class Base:

    __slots__ = ()

    @staticmethod
    def refuse ( reason: str, value: object ) -> Fault:

        try: shown = str(value)[:64]
        except ValueError: shown = type(value).__name__

        return Fault(Code.BAD_REQUEST, "Cannot read the number", f"number.{reason}", { "value": [shown] })

    @staticmethod
    def integer ( value: int, reason: str, low: int, high: int ) -> int:

        if type(value) is not int or not low <= value <= high: raise Base.refuse(reason, value)

        return value

    @staticmethod
    def read ( text: object ) -> Decimal:

        if isinstance(text, bool): raise Base.refuse("decimal", text)
        if isinstance(text, Decimal): return Base.bounded(text)

        if isinstance(text, int):

            if text.bit_length() > INPUT: raise Base.refuse("range", text)

            return Decimal(text)

        raw = str(text)

        if len(raw) > INPUT: raise Base.refuse("range", text)

        try: value = Decimal(raw.strip().replace("_", "").replace(",", ""), context=CONTEXT.copy())
        except (DecimalException, ValueError) as error: raise Base.refuse("decimal", text) from error

        if not value.is_finite(): raise Base.refuse("decimal", text)
        if abs(value.adjusted()) > INPUT: raise Base.refuse("range", text)

        return value

    @staticmethod
    def bounded ( value: Decimal ) -> Decimal:

        if not value.is_finite(): raise Base.refuse("decimal", value)

        shape = value.as_tuple()

        if len(shape.digits) > INPUT or abs(value.adjusted()) > INPUT: raise Base.refuse("range", value)

        return value

    @staticmethod
    def shifted ( value: Decimal, places: int ) -> Decimal:

        shape = value.as_tuple()

        return Decimal((shape.sign, shape.digits, int(shape.exponent) + places))

    @staticmethod
    def rounded ( numerator: int, denominator: int, banker: bool = False ) -> int:

        negative = (numerator < 0) != (denominator < 0)
        whole, rest = divmod(abs(numerator), abs(denominator))
        twice = rest * 2

        if twice > abs(denominator) or (twice == abs(denominator) and (not banker or whole % 2)): whole += 1

        return -whole if negative else whole

    @staticmethod
    def fraction ( numerator: int, denominator: int, places: int ) -> Decimal:

        Base.integer(places, "places", -PLACES, PLACES)

        if places >= 0: numerator *= 10 ** places
        else: denominator *= 10 ** -places

        value = Base.rounded(numerator, denominator)

        if abs(value) >= MAXIMUM: raise Base.refuse("range", value)

        return Decimal(f"{value}e{-places}")
