from engine.error import Code, Fault
import math


class Base:

    __slots__ = ()

    @staticmethod
    def count ( value: int, reason: str ) -> int:

        if type(value) is not int or value < 1: raise Fault(Code.INTERNAL, reason=reason)

        return value

    @staticmethod
    def span ( value: float, reason: str, *, infinite: bool = False ) -> float:

        if type(value) not in (int, float) or not value >= 0:

            raise Fault(Code.INTERNAL, reason=reason)

        try: found = float(value)
        except OverflowError as error: raise Fault(Code.INTERNAL, reason=reason) from error

        if not infinite and not math.isfinite(found): raise Fault(Code.INTERNAL, reason=reason)

        return found
