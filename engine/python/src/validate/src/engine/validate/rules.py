from collections.abc import Callable, Mapping
from decimal import Decimal, InvalidOperation
from typing import Any

from engine.date import DateTime, date
from engine.error import Bag, Code, Fault
from engine.json import json
from engine.parse import parse
from .arch import (
    ACCEPTED, ALPHA, ALPHA_DASH, ALPHA_NUM, BOOLEANS, Check, Compiled, DECLINED, EMPTY, Field, KEY, KEYS, LIMIT,
    NUMERIC, Plain, PLAIN_ARITY, Step,
)
import inspect, re

class Rules:

    def __init__ ( self ) -> None:

        self._checks: dict[str, Check] = {}
        self._compiled: dict[tuple[tuple[str, str], ...], Compiled] = {}

        self._install_()

    def names ( self ) -> tuple[str, ...]:

        return tuple(sorted(self._checks))

    def register ( self, name: str, check: Plain | Check ) -> None:

        arity = len(inspect.signature(check).parameters)

        if arity == PLAIN_ARITY:

            plain = check

            def lifted ( value: Any, argument: str, _: Mapping[str, Any] ) -> str | None:

                return plain(value, argument)  # type: ignore[call-arg]

            self._checks[name] = lifted

        else: self._checks[name] = check  # type: ignore[assignment]

        self._compiled.clear()

    def compile ( self, spec: Mapping[str, str] ) -> Compiled:

        key   = tuple(spec.items())
        found = self._compiled.get(key)

        if found is not None: return found

        fields: list[Field] = []

        for name, rule in spec.items():

            parts = [part for part in rule.split("|") if part]
            steps: list[Step] = []

            for part in parts:

                kind, _, argument = part.partition(":")

                if kind in ("nullable", "sometimes", "bail"): continue

                check = self._checks.get(kind)

                if check is None: raise Fault(Code.INTERNAL, reason="validate.rule", errors={ "rule": [kind] })

                steps.append(Step(kind, argument, check))

            required = any(step.kind == "required" for step in steps)

            fields.append(Field(name, tuple(steps), "nullable" in parts, "sometimes" in parts, required))

        compiled = tuple(fields)

        if len(self._compiled) > LIMIT * LIMIT: self._compiled.clear()

        self._compiled[key] = compiled

        return compiled

    def check (
        self, payload: Mapping[str, Any], spec: Mapping[str, str], reason: str = "validate.rules",
    ) -> dict[str, Any]:

        bag  = Bag()
        kept: dict[str, Any] = {}

        for field in self.compile(spec):

            for path, value, present in self._expand_(payload, field.name):

                message = self._field_(field, value, present, payload)

                if message is not None: bag.add(path, message)

            top = field.name.split(".")[0].split("*")[0] or field.name

            plain = "." not in field.name
            clean = top in payload and not bag.has(field.name) and top not in kept

            if clean and not self._excluded_(field, payload): kept[top] = payload[top]
            if field.nullable and plain and payload.get(top) is None and top not in kept: kept[top] = None

        allowed = { name.split(".")[0] for name in spec }
        allowed |= { f"{field.name}_confirmation" for field in self.compile(spec) if self._confirms_(field) }

        for name in payload:

            if name not in allowed: bag.add(name, "is not allowed")

        bag.raise_if_any(reason)

        return kept

    def _field_ ( self, field: Field, value: Any, present: bool, payload: Mapping[str, Any] ) -> str | None:

        if field.sometimes and not present: return None

        early = self._early_(field, present, payload)

        if early is not None: return early

        absent = value is None or value == ""

        if field.nullable and absent: return None

        if absent:

            if field.required or self._needed_(field, payload): return "is required"

            return self._steps_(field, value, payload) if self._presence_(field) else None

        return self._steps_(field, value, payload)

    def _early_ ( self, field: Field, present: bool, payload: Mapping[str, Any] ) -> str | None:

        for step in field.steps:

            kind = step.kind

            if kind == "missing" and present: return "must be missing"
            if kind == "present" and not present: return "must be present"
            if present and kind.startswith("missing_") and self._conditional_(step, payload): return "must be missing"
            if not present and kind.startswith("present_") and self._conditional_(step, payload):

                return "must be present"

        return None

    def _needed_ ( self, field: Field, payload: Mapping[str, Any] ) -> bool:

        return any(
            step.kind.startswith("required_") and step.kind != KEYS and self._conditional_(step, payload)
            for step in field.steps
        )

    @staticmethod
    def _steps_ ( field: Field, value: Any, payload: Mapping[str, Any] ) -> str | None:

        for step in field.steps:

            implied = step.kind.startswith("required_") and step.kind != KEYS

            if implied or step.kind.startswith(("missing", "present", "exclude")): continue

            message = step.check(value, step.argument, payload)

            if message is not None: return message

        return None

    @staticmethod
    def _confirms_ ( field: Field ) -> bool:

        return any(step.kind == "confirmed" for step in field.steps)

    @staticmethod
    def _presence_ ( field: Field ) -> bool:

        return any(step.kind == "filled" or step.kind.startswith("prohibited") for step in field.steps)

    def _excluded_ ( self, field: Field, payload: Mapping[str, Any] ) -> bool:

        return any(
            step.kind == "exclude" or (step.kind.startswith("exclude_") and self._conditional_(step, payload))
            for step in field.steps
        )

    def _conditional_ ( self, step: Step, payload: Mapping[str, Any] ) -> bool:

        names  = [part for part in step.argument.split(",") if part]
        filled = [self._filled_(payload, name) for name in names]
        pair   = len(names) > 1
        found  = json.get(payload, names[0]) if names else None
        other  = str(found) if names else ""
        equal  = pair and other == names[-1]
        rules  = {
            "required_if"          : equal,
            "required_unless"      : pair and not equal,
            "required_with"        : any(filled),
            "required_with_all"    : bool(filled) and all(filled),
            "required_without"     : not all(filled),
            "required_without_all" : bool(filled) and not any(filled),
            "required_if_accepted" : self._in_(found, ACCEPTED),
            "required_if_declined" : self._in_(found, DECLINED),
            "missing_if"           : equal,
            "missing_unless"       : pair and not equal,
            "missing_with"         : any(filled),
            "missing_with_all"     : bool(filled) and all(filled),
            "present_if"           : equal,
            "present_unless"       : pair and not equal,
            "present_with"         : any(filled),
            "present_with_all"     : bool(filled) and all(filled),
            "exclude_if"           : equal,
            "exclude_unless"       : pair and not equal,
            "exclude_with"         : any(filled),
            "exclude_without"      : not all(filled),
        }

        return rules.get(step.kind, False)

    @staticmethod
    def _filled_ ( payload: Mapping[str, Any], name: str ) -> bool:

        return json.get(payload, name) not in EMPTY

    def _expand_ ( self, payload: Mapping[str, Any], name: str ) -> list[tuple[str, Any, bool]]:

        if "*" not in name:

            found = json.has(payload, name)

            return [(name, json.get(payload, name) if found else None, found)]

        head, _, tail = name.partition(".*")
        items = json.get(payload, head)

        if not isinstance(items, list):

            return [(head, items, json.has(payload, head))] if items is not None else []

        expanded: list[tuple[str, Any, bool]] = []

        for index, item in enumerate(items):

            path = f"{head}.{index}{tail}"

            if tail.startswith(".") and "*" in tail: expanded.extend(self._expand_({ head: items }, path))
            elif tail: expanded.append((path, json.get(item, tail[1:]), json.has(item, tail[1:])))
            else: expanded.append((path, item, True))

        return expanded

    def _install_ ( self ) -> None:

        simple: dict[str, Plain] = {
            "required"   : lambda v, _: None if v not in EMPTY else "is required",
            "present"    : lambda _, __: None,
            "filled"     : lambda v, _: None if v not in EMPTY else "must be filled",
            "missing"    : lambda _, __: "must be missing",
            "prohibited" : lambda v, _: None if v in EMPTY else "is prohibited",
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
            "alpha"      : lambda v, _: None if isinstance(v, str) and ALPHA.match(v) else "must be letters only",
            "alpha_num"  : lambda v, _: self._matches_(v, ALPHA_NUM, "must be letters and numbers"),
            "alpha_dash" : lambda v, _: self._matches_(v, ALPHA_DASH, "must be letters, numbers or dashes"),
            "ascii"      : lambda v, _: None if isinstance(v, str) and v.isascii() else "must be ascii",
            "lowercase"  : lambda v, _: None if isinstance(v, str) and v == v.lower() else "must be lowercase",
            "uppercase"  : lambda v, _: None if isinstance(v, str) and v == v.upper() else "must be uppercase",
            "key"        : lambda v, _: None if isinstance(v, str) and KEY.match(v) else "must be a key",
            "min"        : lambda v, a: None if self._size_(v) >= float(a) else f"must be at least {a}",
            "max"        : lambda v, a: None if self._size_(v) <= float(a) else f"must be at most {a}",
            "size"       : lambda v, a: None if self._size_(v) == float(a) else f"must be exactly {a}",
            "between"    : self._between_,
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

        for name, plain in simple.items(): self.register(name, plain)

        self._checks.update(crossing)

        for name in ("if", "unless", "with", "with_all", "without", "without_all", "if_accepted", "if_declined"):

            self._checks[f"required_{name}"] = self._skip_

        for name in ("if", "unless", "with", "with_all"):

            self._checks[f"missing_{name}"] = self._skip_
            self._checks[f"present_{name}"] = self._skip_

        for name in ("exclude", "exclude_if", "exclude_unless", "exclude_with", "exclude_without"):

            self._checks[name] = self._skip_

    @staticmethod
    def _skip_ ( _: Any, __: str, ___: Mapping[str, Any] ) -> str | None:

        return None

    @staticmethod
    def _number_ ( value: Any, _: str ) -> str | None:

        return None if isinstance(value, int | float) and not isinstance(value, bool) else "must be a number"

    @staticmethod
    def _matches_ ( value: Any, pattern: re.Pattern[str], message: str ) -> str | None:

        return None if isinstance(value, str) and pattern.match(value) else message

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

        return None if isinstance(value, list) and len(set(map(str, value))) == len(value) else "must not repeat"

    @staticmethod
    def _in_array_ ( value: Any, argument: str, payload: Mapping[str, Any] ) -> str | None:

        found = json.get(payload, argument)

        return None if isinstance(found, list) and value in found else f"must be one of {argument}"

    def _confirmed_ ( self, value: Any, argument: str, payload: Mapping[str, Any] ) -> str | None:

        if argument: twin = json.get(payload, f"{argument}_confirmation")
        else: twin = payload.get(self._confirm_(payload, value))

        return None if value == twin else "must be confirmed"

    def _order_ ( self, value: Any, other: Any, kind: str, message: str ) -> str | None:

        left, right = self._size_(value), self._size_(other)
        passed = { "gt": left > right, "gte": left >= right, "lt": left < right, "lte": left <= right }[kind]

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

        if value in EMPTY or (len(names) > 1 and str(json.get(payload, names[0])) == names[1]): return None

        return "is prohibited"

    def _prohibited_state_ (
        self, value: Any, argument: str, payload: Mapping[str, Any], state: frozenset[Any],
    ) -> str | None:

        return None if value in EMPTY or not self._in_(json.get(payload, argument), state) else "is prohibited"

    @staticmethod
    def _prohibited_if_ ( value: Any, argument: str, payload: Mapping[str, Any] ) -> str | None:

        name, _, wanted = argument.partition(",")

        return None if value in EMPTY or str(json.get(payload, name)) != wanted else "is prohibited"

    def _prohibits_ ( self, value: Any, argument: str, payload: Mapping[str, Any] ) -> str | None:

        others = any(self._filled_(payload, name) for name in argument.split(","))

        return None if value in EMPTY or not others else f"prohibits {argument}"

    @staticmethod
    def _in_ ( value: Any, allowed: frozenset[Any] ) -> bool:

        return (value.lower() if isinstance(value, str) else value) in allowed

    @staticmethod
    def _parsed_ ( reader: Callable[[Any], Any], value: Any, message: str, version: int | None = None ) -> str | None:

        if not isinstance(value, str) or len(value) > LIMIT * 4: return message

        try: found = reader(value)
        except Fault: return message

        return None if version is None or getattr(found, "version", None) == version else message

    @staticmethod
    def _numeric_ ( value: Any, _: str ) -> str | None:

        if isinstance(value, int | float) and not isinstance(value, bool): return None

        return None if isinstance(value, str) and NUMERIC.match(value) else "must be numeric"

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

        try: exponent = Decimal(str(value)).as_tuple().exponent if value not in EMPTY else 1
        except (InvalidOperation, ValueError): return "must be a decimal"

        places = max(0, -exponent) if isinstance(exponent, int) else -1

        if places < 0 or isinstance(value, bool): return "must be a decimal"
        if int(low) <= places <= int(high or low): return None

        return f"must have {argument} decimal places"

    @staticmethod
    def _multiple_ ( value: Any, argument: str ) -> str | None:

        try: return None if Decimal(str(value)) % Decimal(argument) == 0 else f"must be a multiple of {argument}"
        except (InvalidOperation, ValueError, ZeroDivisionError): return f"must be a multiple of {argument}"

    @staticmethod
    def _size_ ( value: Any ) -> float:

        if isinstance(value, bool): return float(value)
        if isinstance(value, int | float): return float(value)
        if isinstance(value, str | list | dict | tuple): return float(len(value))

        return 0.0

    def _between_ ( self, value: Any, argument: str ) -> str | None:

        low, _, high = argument.partition(",")

        return None if float(low) <= self._size_(value) <= float(high) else f"must be between {low} and {high}"

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

        passed = {
            "after": left > right, "after_or_equal": left >= right, "before": left < right,
            "before_or_equal": left <= right, "equals": left == right,
        }[kind]

        return None if passed else f"{message} {argument}"

    @staticmethod
    def _confirm_ ( payload: Mapping[str, Any], value: Any ) -> str:

        return next((name for name in payload if name.endswith("_confirmation") and payload[name] == value), "")
