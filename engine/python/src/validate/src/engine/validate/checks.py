from collections.abc import Callable, Mapping
from decimal import Decimal, InvalidOperation
from functools import partial
from typing import Any

from engine.date import DateTime, date
from engine.error import Fault
from engine.json import json
from engine.number import number
from engine.parse import parse
from .arch import (
    ACCEPTED, ALPHA, ALPHA_NUM, ALPHA_DASH, BOOLEANS, Check, COMPARISONS, DECLINED, KEY, LIMIT,
    MISSING, NUMERIC, PLAIN_ARITY, Plain,
)
from .base import Base
import math, re

class Checks:

    __slots__ = ("checks",)

    def __init__ ( self ) -> None:

        self.checks: dict[str, Check] = {}

        simple: dict[str, Plain] = {
            "required"   : lambda v, _: None if not Base.empty(v) else "is required",
            "present"    : lambda _, __: None,
            "filled"     : lambda v, _: None if not Base.empty(v) else "must be filled",
            "missing"    : lambda _, __: "must be missing",
            "prohibited" : lambda v, _: None if Base.empty(v) else "is prohibited",
            "string"     : lambda v, _: None if isinstance(v, str) else "must be a string",
            "integer"    : self._integer_,
            "number"     : self._number_,
            "numeric"    : self._numeric_,
            "boolean"    : lambda v, _: None if self._in_(v, BOOLEANS) else "must be a boolean",
            "accepted"   : lambda v, _: None if self._in_(v, ACCEPTED) else "must be accepted",
            "declined"   : lambda v, _: None if self._in_(v, DECLINED) else "must be declined",
            "list"       : lambda v, _: None if isinstance(v, list) else "must be a list",
            "map"        : lambda v, _: None if isinstance(v, Mapping) else "must be an object",
            "json"       : lambda v, _: None if isinstance(v, str) and json.valid(v) else "must be valid json",
            "email"      : lambda v, _: self._parsed_(parse.email, v, "must be a valid email"),
            "phone"      : lambda v, _: self._parsed_(parse.phone, v, "must be a valid phone"),
            "slug"       : lambda v, _: self._parsed_(parse.slug, v, "must be a slug"),
            "uuid"       : lambda v, _: self._parsed_(parse.uuid, v, "must be a uuid"),
            "ulid"       : lambda v, _: self._parsed_(parse.ulid, v, "must be a ulid"),
            "url"        : lambda v, _: self._parsed_(parse.url, v, "must be a url"),
            "ip"         : lambda v, _: self._parsed_(parse.ip, v, "must be an ip address"),
            "ipv4"       : lambda v, _: self._parsed_(parse.ip, v, "must be an ipv4 address", 4),
            "ipv6"       : lambda v, _: self._parsed_(parse.ip, v, "must be an ipv6 address", 6),
            "mac"        : lambda v, _: self._parsed_(parse.mac, v, "must be a mac address"),
            "hex_color"  : lambda v, _: self._parsed_(parse.color, v, "must be a color"),
            "timezone"   : lambda v, _: self._parsed_(date.zone, v, "must be a timezone"),
            "date"       : lambda v, _: self._parsed_(date.parse, v, "must be a date"),
            "alpha"      : lambda v, _: None if isinstance(v, str) and ALPHA.fullmatch(v) else "must be letters only",
            "alpha_num"  : lambda v, _: self._matches_(v, ALPHA_NUM, "must be letters and numbers"),
            "alpha_dash" : lambda v, _: self._matches_(v, ALPHA_DASH, "must be letters, numbers or dashes"),
            "ascii"      : lambda v, _: None if isinstance(v, str) and v.isascii() else "must be ascii",
            "lowercase"  : lambda v, _: None if isinstance(v, str) and v == v.lower() else "must be lowercase",
            "uppercase"  : lambda v, _: None if isinstance(v, str) and v == v.upper() else "must be uppercase",
            "key"        : lambda v, _: None if isinstance(v, str) and KEY.fullmatch(v) else "must be a key",
            "digits"     : self._digits_,
            "digits_between": self._digits_between_,
            "min_digits" : lambda v, a: None if len(str(v).lstrip("-")) >= int(a) else f"needs at least {a} digits",
            "max_digits" : lambda v, a: None if len(str(v).lstrip("-")) <= int(a) else f"needs at most {a} digits",
            "decimal"    : self._decimal_,
            "multiple_of": self._multiple_,
            "in"         : lambda v, a: None if str(v) in a.split(",") else f"must be one of {a}",
            "not_in"     : lambda v, a: None if str(v) not in a.split(",") else f"must not be one of {a}",
            "regex"      : lambda v, a: None if isinstance(v, str) and re.fullmatch(a, v) else "has an invalid format",
            "not_regex"  : lambda v, a: None if isinstance(v, str) and not re.search(a, v) else "has an invalid format",
            "starts_with": lambda v, a: self._edge_(v, a, "start", wanted=True),
            "ends_with"  : lambda v, a: self._edge_(v, a, "end", wanted=True),
            "doesnt_start_with": lambda v, a: self._edge_(v, a, "start", wanted=False),
            "doesnt_end_with": lambda v, a: self._edge_(v, a, "end", wanted=False),
            "contains"   : self._contains_,
            "doesnt_contain": self._lacks_,
            "distinct"   : self._distinct_,
            "date_format": self._date_format_,
            "array"      : lambda v, _: None if isinstance(v, list | Mapping) else "must be an array",
            "enum"       : lambda v, a: None if str(v) in a.split(",") else f"must be one of {a}",
            "in_array_keys": self._any_keys_,
            "required_array_keys": self._all_keys_,
        }
        crossing: dict[str, Check] = {
            "same"         : lambda v, a, p: None if v == json.get(p, a) else f"must match {a}",
            "different"    : lambda v, a, p: None if v != json.get(p, a) else f"must differ from {a}",
            "confirmed"    : self._confirmed_,
            "gt"           : lambda v, a, p: self._order_(v, json.get(p, a), "gt", f"must be greater than {a}"),
            "gte"          : lambda v, a, p: self._order_(v, json.get(p, a), "gte", f"must be at least {a}"),
            "lt"           : lambda v, a, p: self._order_(v, json.get(p, a), "lt", f"must be less than {a}"),
            "lte"          : lambda v, a, p: self._order_(v, json.get(p, a), "lte", f"must be at most {a}"),
            "in_array"     : self._in_array_,
            "prohibited_if": self._prohibited_if_,
            "prohibited_unless": self._prohibited_unless_,
            "prohibited_if_accepted": lambda v, a, p: self._prohibited_state_(v, a, p, ACCEPTED),
            "prohibited_if_declined": lambda v, a, p: self._prohibited_state_(v, a, p, DECLINED),
            "accepted_if"  : lambda v, a, p: self._when_(v, a, p, (ACCEPTED, "must be accepted")),
            "declined_if"  : lambda v, a, p: self._when_(v, a, p, (DECLINED, "must be declined")),
            "prohibits"    : self._prohibits_,
            "after"        : lambda v, a, p: self._dates_(v, a, p, "after", "must be after"),
            "after_or_equal": lambda v, a, p: self._dates_(v, a, p, "after_or_equal", "must be on or after"),
            "before"       : lambda v, a, p: self._dates_(v, a, p, "before", "must be before"),
            "before_or_equal": lambda v, a, p: self._dates_(v, a, p, "before_or_equal", "must be on or before"),
            "date_equals"  : lambda v, a, p: self._dates_(v, a, p, "equals", "must be on"),
        }

        for name, plain in simple.items(): self.checks[name] = partial(Base.call, plain)

        self.checks.update(crossing)

        for name in ("min", "max", "size", "between"): self.checks[name] = self._skip_

        for name in ("if", "unless", "with", "with_all", "without", "without_all", "if_accepted", "if_declined"):

            self.checks[f"required_{name}"] = self._skip_

        for name in ("if", "unless", "with", "with_all"):

            self.checks[f"missing_{name}"] = self._skip_
            self.checks[f"present_{name}"] = self._skip_

        for name in ("exclude", "exclude_if", "exclude_unless", "exclude_with", "exclude_without"):

            self.checks[name] = self._skip_

    @staticmethod
    def _skip_ ( _: Any, __: str, ___: Mapping[str, Any] ) -> str | None:

        return None

    @staticmethod
    def _number_ ( value: Any, _: str ) -> str | None:

        return None if (
            (isinstance(value, int) and not isinstance(value, bool))
            or (isinstance(value, float) and math.isfinite(value))
        ) else "must be a number"

    @staticmethod
    def _matches_ ( value: Any, pattern: re.Pattern[str], message: str ) -> str | None:

        return None if isinstance(value, str) and pattern.fullmatch(value) else message

    @staticmethod
    def _edge_ ( value: Any, argument: str, side: str, wanted: bool ) -> str | None:

        parts = tuple(argument.split(","))
        found = isinstance(value, str) and (value.startswith(parts) if side == "start" else value.endswith(parts))

        if found == wanted and isinstance(value, str): return None

        return f"must {'' if wanted else 'not '}{side} with {argument}"

    @staticmethod
    def _contains_ ( value: Any, argument: str ) -> str | None:

        wanted = argument.split(",")

        return None if isinstance(value, list) and all(item in value for item in wanted) else f"must contain {argument}"

    @staticmethod
    def _integer_ ( value: Any, _: str ) -> str | None:

        return None if isinstance(value, int) and not isinstance(value, bool) else "must be an integer"

    @staticmethod
    def _distinct_ ( value: Any, _: str ) -> str | None:

        if not isinstance(value, list): return "must not repeat"

        try: distinct = len(set(value)) == len(value)
        except TypeError: distinct = all(item not in value[:index] for index, item in enumerate(value))

        return None if distinct else "must not repeat"

    @staticmethod
    def _in_array_ ( value: Any, argument: str, payload: Mapping[str, Any] ) -> str | None:

        found = json.get(payload, argument)

        return None if isinstance(found, list) and value in found else f"must be one of {argument}"

    def _confirmed_ ( self, value: Any, argument: str, payload: Mapping[str, Any] ) -> str | None:

        return None if value == json.get(payload, argument, MISSING) else "must be confirmed"

    def _order_ ( self, value: Any, other: Any, kind: str, message: str ) -> str | None:

        left, right = self._size_(value), self._size_(other)
        passed = COMPARISONS[kind](left, right)

        return None if passed else message

    @staticmethod
    def _lacks_ ( value: Any, argument: str ) -> str | None:

        wanted = argument.split(",")

        if isinstance(value, list) and not any(item in value for item in wanted): return None

        return f"must not contain {argument}"

    @staticmethod
    def _any_keys_ ( value: Any, argument: str ) -> str | None:

        wanted = argument.split(",")

        if isinstance(value, Mapping) and any(key in value for key in wanted): return None

        return f"must have one of {argument}"

    @staticmethod
    def _all_keys_ ( value: Any, argument: str ) -> str | None:

        wanted = argument.split(",")

        return None if isinstance(value, Mapping) and all(key in value for key in wanted) else f"must have {argument}"

    def _when_ (
        self, value: Any, argument: str, payload: Mapping[str, Any], outcome: tuple[frozenset[Any], str],
    ) -> str | None:

        names = argument.split(",")

        if len(names) < PLAIN_ARITY or str(json.get(payload, names[0])) != names[1]: return None

        return None if self._in_(value, outcome[0]) else outcome[1]

    @staticmethod
    def _prohibited_unless_ ( value: Any, argument: str, payload: Mapping[str, Any] ) -> str | None:

        names = argument.split(",")

        if Base.empty(value) or (len(names) > 1 and str(json.get(payload, names[0])) == names[1]): return None

        return "is prohibited"

    def _prohibited_state_ (
        self, value: Any, argument: str, payload: Mapping[str, Any], state: frozenset[Any],
    ) -> str | None:

        return None if Base.empty(value) or not self._in_(json.get(payload, argument), state) else "is prohibited"

    @staticmethod
    def _prohibited_if_ ( value: Any, argument: str, payload: Mapping[str, Any] ) -> str | None:

        name, _, wanted = argument.partition(",")

        return None if Base.empty(value) or str(json.get(payload, name)) != wanted else "is prohibited"

    def _prohibits_ ( self, value: Any, argument: str, payload: Mapping[str, Any] ) -> str | None:

        others = any(not Base.empty(json.get(payload, name)) for name in argument.split(","))

        return None if Base.empty(value) or not others else f"prohibits {argument}"

    @staticmethod
    def _in_ ( value: Any, allowed: frozenset[Any] ) -> bool:

        return Base.accepts(value, allowed)

    @staticmethod
    def _parsed_ ( reader: Callable[[Any], Any], value: Any, message: str, version: int | None = None ) -> str | None:

        if not isinstance(value, str) or len(value) > LIMIT * 4: return message

        try: found = reader(value)
        except Fault: return message

        return None if version is None or getattr(found, "version", None) == version else message

    @staticmethod
    def _numeric_ ( value: Any, _: str ) -> str | None:

        if isinstance(value, int) and not isinstance(value, bool): return None
        if isinstance(value, float) and math.isfinite(value): return None

        return None if isinstance(value, str) and NUMERIC.fullmatch(value) else "must be numeric"

    @staticmethod
    def _digits_ ( value: Any, argument: str ) -> str | None:

        if isinstance(value, str) and value.isdigit() and len(value) == int(argument): return None

        return f"must be {argument} digits"

    @staticmethod
    def _digits_between_ ( value: Any, argument: str ) -> str | None:

        low, _, high = argument.partition(",")

        if isinstance(value, str) and value.isdigit() and int(low) <= len(value) <= int(high): return None

        return f"must be between {low} and {high} digits"

    @staticmethod
    def _decimal_ ( value: Any, argument: str ) -> str | None:

        low, _, high = argument.partition(",")

        try: exponent = number.exact(Decimal(str(value))).as_tuple().exponent if not Base.empty(value) else 1
        except (Fault, InvalidOperation, ValueError): return "must be a decimal"

        places = max(0, -exponent) if isinstance(exponent, int) else -1

        if places < 0 or isinstance(value, bool): return "must be a decimal"
        if int(low) <= places <= int(high or low): return None

        return f"must have {argument} decimal places"

    @staticmethod
    def _multiple_ ( value: Any, argument: str ) -> str | None:

        try:

            left, bottom = number.exact(Decimal(str(value))).as_integer_ratio()
            right, base = number.exact(argument).as_integer_ratio()
            valid = (left * base) % (bottom * right) == 0

        except (Fault, InvalidOperation, ValueError, ZeroDivisionError): valid = False

        return None if valid else f"must be a multiple of {argument}"

    @staticmethod
    def measure (
        bounds: tuple[str, Decimal, Decimal], message: str, value: Any, _: str, __: Mapping[str, Any],
    ) -> str | None:

        kind, low, high = bounds
        size = Checks._size_(value)

        try:

            if kind == "min": valid = size >= low
            elif kind == "max": valid = size <= low
            elif kind == "size": valid = size == low
            else: valid = low <= size <= high

        except InvalidOperation: valid = False

        return None if valid else message

    @staticmethod
    def _size_ ( value: Any ) -> int | float:

        if isinstance(value, bool): return int(value)
        if isinstance(value, int | float): return value
        if isinstance(value, str | list | dict | tuple): return len(value)

        return 0.0

    @staticmethod
    def _date_format_ ( value: Any, argument: str ) -> str | None:

        if not isinstance(value, str) or len(value) > LIMIT: return "must be a date"

        try: DateTime.strptime(value, argument)
        except ValueError: return f"must match the format {argument}"

        return None

    @staticmethod
    def _dates_ ( value: Any, argument: str, payload: Mapping[str, Any], kind: str, message: str ) -> str | None:

        other = json.get(payload, argument) if json.has(payload, argument) else argument

        try: left, right = date.parse(value), date.parse(other)
        except Fault: return "must be a date"

        passed = COMPARISONS[kind](left, right)

        return None if passed else f"{message} {argument}"

