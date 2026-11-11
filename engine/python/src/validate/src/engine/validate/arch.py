from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

import re

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
EMPTY: tuple[Any, ...] = (None, "", [], {})
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

@dataclass(frozen=True, slots=True)
class Field:

    name     : str
    steps    : tuple[Step, ...]
    nullable : bool
    sometimes: bool
    required : bool

@dataclass(frozen=True, slots=True)
class Member:

    name    : str
    kind    : Any
    default : Any = None
