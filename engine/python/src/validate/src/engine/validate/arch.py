from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

import operator, re

type Spec = Mapping[str, str | Sequence[str]]
type Check = Callable[[Any, str, Mapping[str, Any]], str | None]
type Plain = Callable[[Any, str], str | None]

type Compiled = tuple[Field, ...]

ALPHA     = re.compile(r"^[A-Za-z؀-ۿ ]+$")
ALPHA_NUM = re.compile(r"^[A-Za-z0-9؀-ۿ]+$")
ALPHA_DASH = re.compile(r"^[A-Za-z0-9؀-ۿ_-]+$")
KEY       = re.compile(r"^[a-z][a-z0-9_]*$")
NUMERIC   = re.compile(r"^[-+]?(?:\d+\.?\d*|\.\d+)$")
ACCEPTED  = frozenset({ "yes", "on", "1", "true", 1 })
DECLINED  = frozenset({ "no", "off", "0", "false", 0 })
BOOLEANS  = frozenset({ 1, 0, "1", "0", "true", "false" })
MISSING = object()
LIMIT     = 64
KEYS      = "required_array_keys"
PLAIN_ARITY = 2

UNKNOWN = re.compile(r"unknown field `([^`]+)`")
REFUSED = "is not allowed"

@dataclass(frozen=True, slots=True)
class Step:

    kind     : str
    argument : str
    check    : Check
    parts    : tuple[str, ...] = ()

@dataclass(frozen=True, slots=True)
class Field:

    name     : str
    steps    : tuple[Step, ...]
    nullable : bool
    sometimes: bool
    required : bool
    path     : tuple[str, ...] = ()
    confirms : tuple[str, ...] = ()
    presence : tuple[Step, ...] = ()
    tests    : tuple[Step, ...] = ()
    implicit : bool = False

@dataclass(frozen=True, slots=True)
class Member:

    name    : str
    kind    : Any
    default : Any = None

COMPARISONS: dict[str, Callable[[Any, Any], bool]] = {
    "gt": operator.gt, "gte": operator.ge, "lt": operator.lt, "lte": operator.le,
    "after": operator.gt, "after_or_equal": operator.ge, "before": operator.lt,
    "before_or_equal": operator.le, "equals": operator.eq,
}
CACHE = 256
EXPANSIONS = 10000
CROSS = frozenset({
    "same", "different", "confirmed", "gt", "gte", "lt", "lte", "in_array", "after", "after_or_equal",
    "before", "before_or_equal", "date_equals",
})
CONDITIONS = frozenset({
    "required_if", "required_unless", "required_with", "required_with_all", "required_without", "required_without_all",
    "required_if_accepted", "required_if_declined", "missing_if", "missing_unless", "missing_with", "missing_with_all",
    "present_if", "present_unless", "present_with", "present_with_all", "exclude_if", "exclude_unless",
    "exclude_with", "exclude_without",
})

@dataclass(slots=True)
class Branch:

    children: dict[str, Branch] = field(default_factory=dict)

SCALARS = frozenset({str, int, float, bool, bytes, type(None)})
DIGITS = frozenset({"digits", "digits_between", "min_digits", "max_digits", "decimal"})
SIZES = frozenset({"min", "max", "size", "between", "multiple_of"})
