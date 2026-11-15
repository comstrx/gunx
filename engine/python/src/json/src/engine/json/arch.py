from collections.abc import Callable, Mapping, Sequence
from typing import Any

type Visitor = Callable[[Any, int, Visitor], Any]

type JsonValue = bool | int | float | str | Sequence["JsonValue"] | Mapping[str, "JsonValue"] | None

UNSAFE = { "<": "\\u003c", ">": "\\u003e", "&": "\\u0026", "\u2028": "\\u2028", "\u2029": "\\u2029" }

MISSING = object()
KINDS   = (("boolean", bool), ("number", int | float), ("string", str), ("object", Mapping), ("array", Sequence))

OBJECTS      = (dict, Mapping)
OPERATIONS   = frozenset(("add", "remove", "replace", "move", "copy", "test"))
INDEX_DIGITS = 19

SETS = (set, frozenset)

MAX_DEPTH = 128
MAX_NODES = 100_000

SCALARS = frozenset({str, int, float, bool, type(None), bytes})
