from collections.abc import Callable, Iterable, Mapping
from decimal import Decimal
from itertools import islice
from typing import Any
lazy from engine.array import array
from engine.error import Fault
lazy from engine.json import json
lazy from engine.number import Money, number
from engine.string import string
from .arch import Buffer, FALSE, Fields, INPUT, ITEMS, Rows, TRUE, PAIR, INTEGER, REAL, refuse
import builtins, math

class Cast:

    __slots__ = ()

    def integer ( self, value: object, low: int | None = None, high: int | None = None ) -> int:

        try: made = self._integer_(value)
        except (ValueError, OverflowError) as error: raise refuse("integer") from error

        if made.bit_length() > INPUT: raise refuse("range")
        if low is not None and type(low) is not int: raise refuse("range")
        if high is not None and type(high) is not int: raise refuse("range")
        if (low is not None and made < low) or (high is not None and made > high): raise refuse("range")
        if low is not None and high is not None and low > high: raise refuse("range")

        return made

    def _integer_ ( self, value: object ) -> int:

        if isinstance(value, bool): raise refuse("integer")
        if isinstance(value, int): return value
        if isinstance(value, str) and len(value) <= INPUT: return int(value.strip(), 10)
        if isinstance(value, Decimal):

            if not value.is_finite() or value.adjusted() > INPUT: raise refuse("integer")

        elif not isinstance(value, float) or not math.isfinite(value): raise refuse("integer")

        made = int(value)

        if made != value: raise refuse("integer")

        return made

    def number ( self, value: object, low: float | None = None, high: float | None = None ) -> float:

        if isinstance(value, bool): raise refuse("number")
        if not isinstance(value, (int, float, Decimal, str)): raise refuse("number")
        if isinstance(value, str) and len(value) > INPUT: raise refuse("range")

        try: made = float(value)
        except (ValueError, OverflowError) as error: raise refuse("number") from error

        if not math.isfinite(made): raise refuse("number")

        if low is not None or high is not None: self._bounds_(made, low, high)

        return made

    def _bounds_ ( self, value: float, low: object, high: object ) -> None:

        for bound in (low, high):

            if bound is None: continue
            if not isinstance(bound, (int, float)) or isinstance(bound, bool): raise refuse("range")
            if isinstance(bound, float) and not math.isfinite(bound): raise refuse("range")

        if isinstance(low, (int, float)) and value < low: raise refuse("range")
        if isinstance(high, (int, float)) and value > high: raise refuse("range")

    def decimal ( self, value: object, places: int | None = None ) -> Decimal:

        try: return number.decimal(value.major() if isinstance(value, Money) else value, places)
        except Fault as error: raise refuse("decimal") from error

    def boolean ( self, value: object ) -> bool:

        if isinstance(value, bool): return value
        if type(value) is int and value in (0, 1): return bool(value)
        if not isinstance(value, str) or len(value) > INPUT: raise refuse("boolean")

        text = value.strip().lower()

        if text in TRUE: return True
        if text in FALSE: return False

        raise refuse("boolean")

    def text ( self, value: object, encoding: str = "utf-8" ) -> str:

        if isinstance(value, str): return value
        if isinstance(value, Money): return value.text()

        if not isinstance(encoding, str): raise refuse("text")

        try:

            if isinstance(value, (builtins.bytes, bytearray, memoryview)):

                return builtins.bytes(value).decode(encoding)

            return str(value)

        except (UnicodeError, LookupError, ValueError) as error: raise refuse("text") from error

    def bytes ( self, value: str | Buffer, encoding: str = "utf-8" ) -> builtins.bytes:

        if not isinstance(encoding, str): raise refuse("bytes")

        try:

            if isinstance(value, str): return value.encode(encoding)
            if isinstance(value, (builtins.bytes, bytearray, memoryview)): return builtins.bytes(value)

        except (UnicodeError, LookupError, ValueError) as error: raise refuse("bytes") from error

        raise refuse("bytes")

    def list (
        self, value: object, separator: str = ",", *, using: Callable[[Any], Any] | None = None, limit: int = ITEMS,
    ) -> Rows:

        self._limit_(limit)

        if value is None: rows: Rows = []
        elif type(value) is builtins.list or type(value) is tuple:

            if len(value) > limit: raise refuse("limit")

            rows = builtins.list(value)

        elif isinstance(value, str):

            if len(value) > ITEMS: raise refuse("limit")

            rows = string.split(value, separator)
        elif isinstance(value, Mapping | builtins.bytes | bytearray | memoryview): raise refuse("list")
        elif isinstance(value, Iterable): rows = builtins.list(islice(value, limit + 1))
        else: rows = array.wrap(value)

        if len(rows) > limit: raise refuse("limit")

        return array.map(rows, using) if using is not None else rows

    def dict ( self, value: object, *, limit: int = ITEMS ) -> Fields:

        self._limit_(limit)
        pairs = self._pairs_(value, limit)

        if isinstance(pairs, Mapping):

            made = builtins.dict(pairs)

            if len(made) > limit: raise refuse("limit")
            if any(not isinstance(key, str) for key in made): raise refuse("dict")

            return made

        found: Fields = {}

        for count, pair in enumerate(pairs, 1):

            if count > limit: raise refuse("limit")
            if not isinstance(pair, (tuple, builtins.list)) or len(pair) != PAIR: raise refuse("dict")

            key, item = pair

            if not isinstance(key, str) or key in found: raise refuse("dict")

            found[key] = item

        return found

    def _pairs_ ( self, value: object, limit: int ) -> Iterable[Any]:

        if isinstance(value, (str, builtins.bytes, bytearray, memoryview)):

            size = value.nbytes if isinstance(value, memoryview) else len(value)

            if size > ITEMS: raise refuse("limit")

            try: value = json.decode(value)
            except Fault as error: raise refuse("dict") from error

        if isinstance(value, Mapping):

            if len(value) > limit: raise refuse("limit")

            return value

        if isinstance(value, Iterable): return islice(value, limit + 1)

        raise refuse("dict")

    def money ( self, value: object, currency: str | None = None, *, minor: bool = False ) -> Money:

        if isinstance(value, float) or type(minor) is not bool: raise refuse("money")
        if currency is not None and not isinstance(currency, str): raise refuse("currency")

        try:

            if isinstance(value, Money):

                if currency is not None and value.currency != currency.upper(): raise refuse("currency")

                return value

            if isinstance(value, Mapping): return self._money_fields_(value, currency)

            if currency is None:

                if minor: raise refuse("currency")

                return number.parse_money(value)

            return number.minor(self.integer(value), currency) if minor else number.money(value, currency)

        except Fault as error:

            if error.reason and error.reason.startswith("cast."): raise

            raise refuse("money") from error

    def _money_fields_ ( self, value: Mapping[Any, Any], currency: str | None ) -> Money:

        code = value.get("currency")
        amount = value.get("minor")

        if not isinstance(code, str) or type(amount) is not int: raise refuse("money")
        if currency is not None and code.upper() != currency.upper(): raise refuse("currency")

        return number.minor(self.integer(amount), code)

    def minor ( self, value: object, currency: str | None = None ) -> int:

        return self.money(value, currency).minor

    def major ( self, value: object, currency: str | None = None ) -> Decimal:

        return self.money(value, currency).major()

    def auto ( self, value: object ) -> Any:

        if not isinstance(value, str): return value
        if len(value) > INPUT: raise refuse("limit")

        text = value.strip()
        lower = text.lower()

        if lower in ("", "null", "none", "nil"): return None
        if lower in ("true", "false"): return lower == "true"

        convert = self.integer if INTEGER.fullmatch(text) else self.number if REAL.fullmatch(text) else None

        if convert is not None:

            try: return convert(text)
            except Fault: pass

        return value

    def _limit_ ( self, limit: int ) -> None:

        if type(limit) is not int or not 0 <= limit <= ITEMS: raise refuse("limit")
