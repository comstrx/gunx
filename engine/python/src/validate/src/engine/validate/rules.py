from collections.abc import Mapping
from decimal import Decimal, InvalidOperation
from functools import partial
from threading import RLock
from typing import Any

from engine.error import Code, Fault
from engine.number import number
from .arch import (
    CACHE, CONDITIONS, DIGITS, EXPANSIONS, LIMIT, PLAIN_ARITY, SIZES, Check, Compiled, Field, Plain, Spec, Step,
)
from .base import Base
from .checks import Checks
from .plan import Plan
import inspect, re

class Rules:

    __slots__ = ("_cache", "_checks", "_compiled", "_limit", "_lock")

    def __init__ ( self, *, cache: int = CACHE, limit: int = EXPANSIONS ) -> None:

        self._checks = Checks().checks
        self._compiled: dict[tuple[tuple[str, tuple[str, ...]], ...], Plan] = {}
        self._cache = Base.bound(cache, "cache", allow_zero=True)
        self._limit = Base.bound(limit, "limit")
        self._lock = RLock()

    def names ( self ) -> tuple[str, ...]:

        with self._lock: return tuple(sorted(self._checks))

    def register ( self, name: str, check: Plain | Check ) -> None:

        name = Base.text(name, "validate.rule")

        if not callable(check): raise Fault(Code.INTERNAL, reason="validate.rule")

        if inspect.iscoroutinefunction(check) or inspect.iscoroutinefunction(type(check).__call__):

            raise Fault(Code.INTERNAL, reason="validate.async")

        try: arity = len(inspect.signature(check).parameters)
        except (TypeError, ValueError) as error: raise Fault(Code.INTERNAL, reason="validate.signature") from error

        if arity not in (PLAIN_ARITY, PLAIN_ARITY + 1): raise Fault(Code.INTERNAL, reason="validate.signature")

        lifted = partial(Base.custom, check, arity)

        with self._lock:

            self._checks[name] = lifted
            self._compiled.clear()

    def compile ( self, spec: Spec ) -> Compiled:

        return self.prepare(spec).fields

    def prepare ( self, spec: Spec ) -> Plan:

        given: Any = spec

        if not isinstance(given, Mapping) or len(given) > self._limit:

            raise Fault(Code.INTERNAL, reason="validate.spec")

        try:

            key = tuple(
                (name, tuple(rule.split("|")) if isinstance(rule, str) else tuple(rule)) for name, rule in spec.items()
            )
            hash(key)

        except (AttributeError, TypeError) as error: raise Fault(Code.INTERNAL, reason="validate.spec") from error

        with self._lock:

            found = self._compiled.get(key)

            if found is not None: return found

            fields = tuple(self._field_(name, self._parts_(parts)) for name, parts in key)
            plan = Plan(fields, self._limit)

            if self._cache:

                if len(self._compiled) >= self._cache: self._compiled.pop(next(iter(self._compiled)))

                self._compiled[key] = plan

            return plan

    def check ( self, payload: Mapping[str, Any], spec: Spec | Plan, reason: str = "validate.rules" ) -> dict[str, Any]:

        return (spec if isinstance(spec, Plan) else self.prepare(spec)).check(payload, reason)

    def errors ( self, payload: Mapping[str, Any], spec: Spec | Plan ) -> dict[str, list[str]]:

        return (spec if isinstance(spec, Plan) else self.prepare(spec)).errors(payload)

    def valid ( self, payload: Mapping[str, Any], spec: Spec | Plan ) -> bool:

        return (spec if isinstance(spec, Plan) else self.prepare(spec)).valid(payload)

    @staticmethod
    def _parts_ ( rule: Any ) -> tuple[str, ...]:

        parts: tuple[Any, ...]

        if isinstance(rule, str): parts = tuple(rule.split("|"))
        elif isinstance(rule, list | tuple): parts = tuple(rule)
        else: raise Fault(Code.INTERNAL, reason="validate.spec")

        if len(parts) > LIMIT * 2 or any(not isinstance(part, str) or len(part) > LIMIT * LIMIT for part in parts):

            raise Fault(Code.INTERNAL, reason="validate.spec")

        return parts

    def _field_ ( self, name: str, parts: tuple[str, ...] ) -> Field:

        name = Base.text(name, "validate.path")

        if len(name) > LIMIT * LIMIT: raise Fault(Code.INTERNAL, reason="validate.path")

        path = tuple(name.split("."))

        if len(path) > LIMIT or "" in path or path[0] == "*":

            raise Fault(Code.INTERNAL, reason="validate.path")

        steps = tuple(
            self._step_(name, part) for part in parts if part and part not in ("nullable", "sometimes", "bail")
        )
        confirms = tuple(step.argument for step in steps if step.kind == "confirmed")

        presence = tuple(step for step in steps if step.kind in CONDITIONS or step.kind in ("present", "missing"))
        tests = tuple(
            step for step in steps
            if step.kind not in CONDITIONS and step.kind not in ("required", "present", "missing", "exclude")
        )
        implicit = any(step.kind == "filled" or step.kind.startswith("prohibited") for step in tests)

        return Field(
            name, steps, "nullable" in parts, "sometimes" in parts, "required" in parts, path, confirms,
            presence, tests, implicit,
        )

    def _step_ ( self, name: str, part: str ) -> Step:

        kind, _, argument = part.partition(":")
        check = self._checks.get(kind)

        if check is None: raise Fault(Code.INTERNAL, reason="validate.rule", errors={ "rule": [kind] })

        if isinstance(check, partial) and check.func is Base.custom:

            return Step(kind, argument, check, tuple(argument.split(",")) if argument else ())

        if kind == "confirmed": argument = argument or f"{name}_confirmation"
        if kind in ("regex", "not_regex"):

            try: check = partial(Base.pattern, re.compile(argument), kind == "not_regex")
            except re.error as error: raise Fault(Code.INTERNAL, reason="validate.regex") from error

        self._argument_(kind, argument)

        if kind in ("min", "max", "size", "between"):

            bounds = tuple(number.exact(part) for part in argument.split(","))
            text = {
                "min": f"must be at least {argument}", "max": f"must be at most {argument}",
                "size": f"must be exactly {argument}", "between": f"must be between {argument.replace(',', ' and ')}",
            }[kind]
            check = partial(Checks.measure, (kind, bounds[0], bounds[-1]), text)

        return Step(kind, argument, check, tuple(argument.split(",")) if argument else ())

    @staticmethod
    def _argument_ ( kind: str, argument: str ) -> None:

        if kind in SIZES | DIGITS: Rules._numbers_(kind, argument)
        if kind in CONDITIONS:

            parts = argument.split(",")
            pair = kind.endswith(("_if", "_unless"))

            if not all(parts) or (pair and len(parts) < PLAIN_ARITY):

                raise Fault(Code.INTERNAL, reason="validate.argument", errors={kind: ["invalid condition"]})

    @staticmethod
    def _numbers_ ( kind: str, argument: str ) -> None:

        try: values = tuple(number.exact(Decimal(part)) for part in argument.split(","))
        except (Fault, InvalidOperation) as error: raise Fault(Code.INTERNAL, reason="validate.argument") from error

        pair = kind in ("between", "digits_between")
        flexible = kind == "decimal"
        count = len(values)
        valid = count == (PLAIN_ARITY if pair else 1) or (flexible and count == PLAIN_ARITY)
        valid = valid and all(value.is_finite() for value in values)

        if valid and kind in DIGITS:

            try: integers = tuple(int(part) for part in argument.split(","))
            except ValueError as error: raise Fault(Code.INTERNAL, reason="validate.argument") from error

            valid = all(value >= 0 for value in integers)

        if valid and count == PLAIN_ARITY: valid = values[0] <= values[1]
        if not valid: raise Fault(Code.INTERNAL, reason="validate.argument", errors={kind: ["invalid numeric bounds"]})
