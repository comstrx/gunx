from collections.abc import Mapping
from typing import Any, cast

from engine.error import Code, Fault
from engine.json import json
from .arch import ACCEPTED, DECLINED, MISSING, PLAIN_ARITY, Check, Plain, Step
import inspect, re

class Base:

    __slots__ = ()

    @staticmethod
    def empty ( value: Any ) -> bool:

        if value is None or value is MISSING: return True
        if isinstance(value, (str, list, dict, tuple)): return len(value) == 0

        return False

    @staticmethod
    def accepts ( value: Any, allowed: frozenset[Any] ) -> bool:

        if isinstance(value, str): return value.lower() in allowed
        if isinstance(value, bool | int | float): return value in allowed

        return False

    @staticmethod
    def call ( check: Plain, value: Any, argument: str, _: Mapping[str, Any] ) -> str | None:

        return check(value, argument)

    @staticmethod
    def condition ( step: Step, payload: Mapping[str, Any] ) -> bool:

        names = step.parts
        kind = step.kind.split("_", 1)[1]
        found = json.get(payload, names[0], MISSING) if names else MISSING

        if kind == "if_accepted": return Base.accepts(found, ACCEPTED)
        if kind == "if_declined": return Base.accepts(found, DECLINED)
        if kind in ("if", "unless"):

            equal = found is not MISSING and str(found) in names[1:]

            return equal if kind == "if" else not equal

        values = (Base.empty(json.get(payload, name, MISSING)) for name in names)

        if kind == "with": return not all(values)
        if kind == "with_all": return not any(values)

        return any(values) if kind == "without" else all(values)

    @staticmethod
    def argument ( argument: str, indices: tuple[str, ...] ) -> str:

        if "*" not in argument: return argument

        parts = argument.split(".")
        values = iter(indices)

        return ".".join(next(values, part) if part == "*" else part for part in parts)

    @staticmethod
    def pattern (
        pattern: re.Pattern[str], negative: bool, value: Any, _: str, __: Mapping[str, Any],
    ) -> str | None:

        if not isinstance(value, str): return "has an invalid format"
        found = pattern.search(value) if negative else pattern.fullmatch(value)

        return None if bool(found) != negative else "has an invalid format"

    @staticmethod
    def bound ( value: object, name: str, allow_zero: bool = False ) -> int:

        if isinstance(value, bool) or not isinstance(value, int) or value < (0 if allow_zero else 1):

            raise Fault(Code.INTERNAL, reason="validate.options", errors={ name: ["must be a valid limit"] })

        return value

    @staticmethod
    def text ( value: object, reason: str ) -> str:

        if not isinstance(value, str) or not value: raise Fault(Code.INTERNAL, reason=reason)

        return value

    @staticmethod
    def custom (
        check: Plain | Check, arity: int, value: Any, argument: str, payload: Mapping[str, Any],
    ) -> str | None:

        result: Any = (
            cast("Plain", check)(value, argument)
            if arity == PLAIN_ARITY else cast("Check", check)(value, argument, payload)
        )

        if result is None or isinstance(result, str): return result
        if inspect.iscoroutine(result): result.close()

        raise Fault(Code.INTERNAL, reason="validate.check")
